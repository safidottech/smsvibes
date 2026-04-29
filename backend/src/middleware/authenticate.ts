import { Request, Response, NextFunction } from 'express';

/**
 * authenticate (Stub)
 * Extracts JWT from Authorization bearer or API key and attaches to req.user
 * 
 * TODO: Implement actual authentication logic (JWT verification or API key validation)
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  // req.user = extractedUser;
  next();
};
