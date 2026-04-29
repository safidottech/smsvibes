import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../../middleware/authenticate';
import { authorize } from '../../middleware/authorize';
import Wallet from '../../models/Wallet';
import Transaction from '../../models/Transaction';

// Extend Express Request to include authenticated user (matches AuthRequest interface)
interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: 'superadmin' | 'admin' | 'user';
        accountType: 'b2c' | 'b2b';
    };
}

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /wallet/balance
// Returns the authenticated user's wallet balance.
// All monetary values are returned as integer cents (Cents Law).
// ─────────────────────────────────────────────────────────────────────────────
router.get(
    '/balance',
    authenticate,
    authorize('superadmin', 'admin', 'user'),
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;

            const wallet = await Wallet.findOne({ userId: new mongoose.Types.ObjectId(userId) });

            if (!wallet) {
                return res.status(404).json({
                    error: true,
                    code: 'WALLET_NOT_FOUND',
                    message: 'Wallet not found for this user',
                });
            }

            // totalBalance is a virtual on the Wallet schema (available + held)
            return res.status(200).json({
                available: wallet.available,
                held: wallet.held,
                total: wallet.totalBalance,
            });
        } catch (err: any) {
            return res.status(500).json({
                error: true,
                code: 'INTERNAL_ERROR',
                message: err.message || 'Failed to retrieve wallet balance',
            });
        }
    }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /wallet/transactions
// Returns paginated transaction history for the authenticated user.
// Query params: page (default 1), limit (default 20), sort by createdAt desc.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
    '/transactions',
    authenticate,
    authorize('superadmin', 'admin', 'user'),
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;

            // Parse pagination params
            const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
            const skip = (page - 1) * limit;

            // Fetch transactions with pagination (immutable ledger — read-only)
            const [transactions, totalCount] = await Promise.all([
                Transaction.find({ userId: new mongoose.Types.ObjectId(userId) })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit)
                    .lean(),
                Transaction.countDocuments({ userId: new mongoose.Types.ObjectId(userId) }),
            ]);

            return res.status(200).json({
                data: transactions,
                pagination: {
                    page,
                    limit,
                    totalCount,
                    totalPages: Math.ceil(totalCount / limit),
                    hasNextPage: page * limit < totalCount,
                    hasPrevPage: page > 1,
                },
            });
        } catch (err: any) {
            return res.status(500).json({
                error: true,
                code: 'INTERNAL_ERROR',
                message: err.message || 'Failed to retrieve transaction history',
            });
        }
    }
);

export default router;