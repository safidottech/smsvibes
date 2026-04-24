import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL as string;

if (!REDIS_URL) {
  console.warn('⚠️ REDIS_URL is not defined in environment variables. Connection may fail.');
}

/**
 * Instantiate the Redis Client using External Redis Cloud.
 *
 * BullMQ Compatibility Strategy:
 * We MUST set `maxRetriesPerRequest: null`. BullMQ relies on blocking
 * Redis commands (like BRPOPLPUSH) to wait for incoming queue jobs.
 * By default, ioredis will retry failed operations. However, applying
 * retries to blocking commands can break BullMQ's internal mechanisms,
 * leading to stalled or duplicate job execution. Disabling these retries
 * ensures smooth queue processing across application restarts.
 */
const redisClient = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
});

/**
 * Circuit Breaker Hook (Foundation for Sprint 5)
 * Currently logs connection issues to console.error.
 * In Sprint 5, this will be extended to set a global flag
 * (e.g., global.redisCircuitOpen = true) to trigger a 503
 * "Service Unavailable" amber banner on the frontend UI.
 */
redisClient.on('error', (error) => {
  console.error('[Redis] Connection Error:', error);
});

export default redisClient;
