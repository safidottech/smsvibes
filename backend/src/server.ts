import 'dotenv/config';
import express, { Request, Response } from 'express';
import connectDB from './config/database';
const app = express();
const PORT = process.env.PORT || 5000;

app.use(express.json());

/**
 * ============================================================================
 * ⚠️ THE CENTS LAW ⚠️
 * ============================================================================
 * All monetary values MUST be stored and calculated as integer cents.
 * Example: $1.00 MUST be represented as 100.
 * Floating-point math is STRICTLY FORBIDDEN for financial logic across the
 * SMSVIBES platform to prevent precision and rounding errors.
 * ============================================================================
 */

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Initialize DB and then start server
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
  });
});
