import { Request, Response, NextFunction } from 'express';
import redisClient from '../config/redis';

/**
 * Rate Limit Types supported by the system
 */
type RateLimitType = 'apikey' | 'user' | 'ip';

/**
 * Redis Rate Limiting Middleware Factory
 * 
 * Implements an atomic INCR + EXPIRE pattern to prevent race conditions.
 * Uses Redis-based counters to track request volume within a rolling window.
 * 
 * @param type - The strategy to identify the client ('apikey' | 'user' | 'ip')
 * @param maxRequests - Maximum number of requests allowed in the window
 * @param windowSeconds - The duration of the rate limit window in seconds
 * @returns Express middleware
 */
export const rateLimiter = (type: RateLimitType, maxRequests: number, windowSeconds: number) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      let identifier: string | undefined;

      // Identify the client based on the strategy
      switch (type) {
        case 'apikey': {
          const apiKey = req.headers['x-api-key'] as string;
          if (apiKey) {
            // Use prefix logic: first 8 chars to avoid leaking full keys in Redis
            identifier = apiKey.substring(0, 8);
          }
          break;
        }
        case 'user': {
          // Assume req.user is attached by authentication middleware
          identifier = (req as any).user?.userId;
          break;
        }
        case 'ip': {
          identifier = req.ip;
          break;
        }
      }

      // If we can't identify the source (e.g. missing API key or unauthenticated), 
      // we bypass rate limiting at this level and let other middlewares handle it.
      if (!identifier) {
        return next();
      }

      const key = `ratelimit:${type}:${identifier}`;

      // Atomic INCR + EXPIRE Pattern
      // We increment first. If the result is 1, it means this is a new window.
      const requests = await redisClient.incr(key);

      if (requests === 1) {
        await redisClient.expire(key, windowSeconds);
      }

      // Check if threshold exceeded
      if (requests > maxRequests) {
        const ttl = await redisClient.ttl(key);
        
        return res.status(429).json({
          error: true,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: ttl > 0 ? ttl : 0
        });
      }

      next();
    } catch (error) {
      /**
       * Graceful Degradation:
       * If Redis is down or timing out, we log the error but allow the request.
       * This prevents a Redis outage from becoming a complete application outage.
       */
      console.error(`[RateLimiter] Redis Error for type ${type}:`, error);
      next();
    }
  };
};
