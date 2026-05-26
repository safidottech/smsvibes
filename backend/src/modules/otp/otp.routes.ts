import { Router, Response } from 'express';
import mongoose from 'mongoose';

import { authenticate } from '../../middleware/authenticate';
import { authorize, AuthRequest } from '../../middleware/authorize';
import OtpRequest from '../../models/OtpRequest';
import { createOtpRequest } from './otp.service';
import {
  refundEscrow,
  cancelWithFee,
} from '../wallet/wallet.service';

/**
 * OTP Module Routes
 *
 * Base path (mounted in server.ts): /api/v1/otp
 *
 * Middleware chain applied to ALL routes:
 *   authenticate  →  resolves JWT Bearer or x-api-key, attaches req.user
 *   authorize     →  enforces RBAC; only 'user', 'admin', 'superadmin' can access
 *
 * Cancellation Decision Matrix (PRD §7.3 / Architecture §4.3):
 *   ┌──────────────────────────────────────┬──────────────────────────────────┐
 *   │ OtpRequest.status                    │ Action                           │
 *   ├──────────────────────────────────────┼──────────────────────────────────┤
 *   │ received                             │ 400 CANNOT_CANCEL (OTP delivered)│
 *   │ failed / cancelled                   │ 400 ALREADY_RESOLVED             │
 *   │ pending  (no OTP on server yet)      │ 100% refundEscrow                │
 *   │ pending  (OTP arrived, not received) │ cancelWithFee (12% deducted)     │
 *   └──────────────────────────────────────┴──────────────────────────────────┘
 *
 * NOTE: The "OTP on server but not yet received" edge-case is detected by
 * inspecting the last attempt's result field. If it equals 'success' but
 * the request status is still 'pending', the OTP has arrived server-side.
 * A 12% fee is charged per PRD §7.3 and Architecture §4.3.
 *
 * Cents Law: All `price`, `refundAmount`, `feeAmount` values are integers.
 */

const router = Router();

// ─── Shared middleware ────────────────────────────────────────────────────────
// Every endpoint in this module requires authentication + role check.
const authChain = [authenticate, authorize('user', 'admin', 'superadmin')];

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/otp/request
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Initiates a new OTP request for the authenticated user.
 *
 * Body: { service: string, countryCode: string, price: number (cents), phoneNumber?: string }
 *
 * Response 201:
 * {
 *   requestId: string,
 *   status:    'pending',
 *   price:     number   // integer cents – Cents Law
 * }
 */
router.post('/request', ...authChain, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { service, countryCode, price, phoneNumber } = req.body as {
      service: string;
      countryCode: string;
      price: number;
      phoneNumber?: string;
    };

    // ── Input validation ────────────────────────────────────────────────────
    if (!service || typeof service !== 'string' || service.trim() === '') {
      res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'service is required and must be a non-empty string',
      });
      return;
    }

    if (!countryCode || typeof countryCode !== 'string' || countryCode.trim() === '') {
      res.status(400).json({
        error: true,
        code: 'VALIDATION_ERROR',
        message: 'countryCode is required and must be a non-empty string',
      });
      return;
    }

    // Cents Law: price must be a positive integer
    if (typeof price !== 'number' || !Number.isInteger(price) || price <= 0) {
      res.status(400).json({
        error: true,
        code: 'CENTS_LAW_VIOLATION',
        message: 'price must be a positive integer (cents)',
      });
      return;
    }

    // ── Delegate to service (holds escrow + creates doc + enqueues BullMQ job)
    const requestId = await createOtpRequest({
      userId,
      service: service.trim(),
      countryCode: countryCode.trim().toUpperCase(),
      price,
      phoneNumber,
    });

    res.status(201).json({
      requestId,
      status: 'pending',
      price, // integer cents – Cents Law
    });
  } catch (err: any) {
    // Wallet service throws INSUFFICIENT_BALANCE as a plain Error
    if (err?.message === 'INSUFFICIENT_BALANCE') {
      res.status(402).json({
        error: true,
        code: 'INSUFFICIENT_BALANCE',
        message: 'Insufficient wallet balance. Please top up your account.',
      });
      return;
    }

    console.error('[OTP] POST /request error:', err);
    res.status(500).json({
      error: true,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to create OTP request. Please try again.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/otp/status/:requestId
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns the live status of an OTP request.
 * Ownership is enforced — users can only query their own requests.
 *
 * Response 200 (pending / failed / cancelled):
 * {
 *   requestId: string,
 *   status:    'pending' | 'failed' | 'cancelled',
 *   price:     number,
 *   service:   string,
 *   countryCode: string,
 *   createdAt: string (ISO)
 * }
 *
 * Response 200 (received – OTP delivered):
 * {
 *   ...above,
 *   otp: string   // only present when status === 'received'
 * }
 */
router.get('/status/:requestId', ...authChain, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { requestId } = req.params;

    // ── Validate ObjectId format to prevent DB errors ───────────────────────
    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      res.status(400).json({
        error: true,
        code: 'INVALID_REQUEST_ID',
        message: 'requestId is not a valid identifier',
      });
      return;
    }

    const request = await OtpRequest.findById(requestId).lean();

    if (!request) {
      res.status(404).json({
        error: true,
        code: 'NOT_FOUND',
        message: 'OTP request not found',
      });
      return;
    }

    // ── Ownership check ─────────────────────────────────────────────────────
    if (request.userId.toString() !== userId) {
      res.status(403).json({
        error: true,
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this request',
      });
      return;
    }

    // ── Build response — only expose OTP when actually delivered ────────────
    const baseResponse = {
      requestId: request._id.toString(),
      status: request.status,
      price: request.price, // integer cents – Cents Law
      service: request.service,
      countryCode: request.countryCode,
      createdAt: request.createdAt,
      resolvedAt: request.resolvedAt ?? null,
    };

    if (request.status === 'received' && request.otp) {
      res.status(200).json({ ...baseResponse, otp: request.otp });
      return;
    }

    res.status(200).json(baseResponse);
  } catch (err: any) {
    console.error('[OTP] GET /status error:', err);
    res.status(500).json({
      error: true,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch OTP status. Please try again.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/v1/otp/cancel/:requestId
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Cancels a pending OTP request and triggers the appropriate refund.
 *
 * Cancellation Decision Matrix (PRD §7.3 / Architecture §4.3):
 *   - status === 'received'    → 400 CANNOT_CANCEL  (OTP delivered, too late)
 *   - status === 'failed'
 *     | 'cancelled'            → 400 ALREADY_RESOLVED
 *   - status === 'pending'
 *     + OTP NOT on server yet  → 100% full refund via refundEscrow
 *   - status === 'pending'
 *     + OTP IS on server       → 88% refund via cancelWithFee (12% fee charged)
 *
 * The "OTP on server" edge-case is determined by checking if any attempt
 * has result === 'success'. This means the OTP arrived at the provider level
 * but the status hasn't been updated to 'received' yet (race condition window).
 *
 * Response 200:
 * {
 *   requestId:    string,
 *   status:       'cancelled',
 *   refundAmount: number,  // integer cents – Cents Law
 *   feeAmount:    number,  // 0 for full refund, >0 for 12% fee case
 *   message:      string
 * }
 */
router.post('/cancel/:requestId', ...authChain, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { requestId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(requestId)) {
      res.status(400).json({
        error: true,
        code: 'INVALID_REQUEST_ID',
        message: 'requestId is not a valid identifier',
      });
      return;
    }

    const request = await OtpRequest.findById(requestId);

    if (!request) {
      res.status(404).json({
        error: true,
        code: 'NOT_FOUND',
        message: 'OTP request not found',
      });
      return;
    }

    // ── Ownership check ─────────────────────────────────────────────────────
    if (request.userId.toString() !== userId) {
      res.status(403).json({
        error: true,
        code: 'FORBIDDEN',
        message: 'You do not have permission to cancel this request',
      });
      return;
    }

    // ── Terminal state guard ────────────────────────────────────────────────
    if (request.status === 'received') {
      res.status(400).json({
        error: true,
        code: 'CANNOT_CANCEL',
        message: 'OTP has already been delivered. Cancellation is not possible.',
      });
      return;
    }

    if (request.status === 'failed' || request.status === 'cancelled') {
      res.status(400).json({
        error: true,
        code: 'ALREADY_RESOLVED',
        message: `This request has already been ${request.status} and cannot be cancelled.`,
      });
      return;
    }

    // ── Detect "OTP on server" edge-case (PRD §7.3) ─────────────────────────
    // If the last attempt result is 'success', the OTP reached the provider
    // server but the document hasn't been marked 'received' yet.
    const otpOnServer = request.attempts.some((a) => a.result === 'success');

    const price = request.price; // integer cents – Cents Law guaranteed by schema
    let refundAmount: number;
    let feeAmount: number;

    if (otpOnServer) {
      // Edge case: OTP on server — apply 12% cancellation fee (Architecture §4.3)
      const result = await cancelWithFee(userId, price);
      refundAmount = price - result.feeAmount; // integer: fee + refund = price
      feeAmount = result.feeAmount;
    } else {
      // Normal pending cancellation — 100% refund (Architecture §4.3)
      await refundEscrow(userId, price);
      refundAmount = price;
      feeAmount = 0;
    }

    // ── Persist cancellation ─────────────────────────────────────────────────
    await OtpRequest.findByIdAndUpdate(requestId, {
      status: 'cancelled',
      resolvedAt: new Date(),
    });

    res.status(200).json({
      requestId,
      status: 'cancelled',
      refundAmount, // integer cents – Cents Law
      feeAmount,    // integer cents – Cents Law (0 or 12% of price)
      message: otpOnServer
        ? `Request cancelled. ${feeAmount} cents deducted as provider fee. ${refundAmount} cents refunded.`
        : `Request cancelled. Full refund of ${refundAmount} cents has been applied.`,
    });
  } catch (err: any) {
    if (err?.message === 'INSUFFICIENT_HELD_BALANCE') {
      res.status(409).json({
        error: true,
        code: 'INSUFFICIENT_HELD_BALANCE',
        message: 'Held balance mismatch. The refund could not be processed.',
      });
      return;
    }

    console.error('[OTP] POST /cancel error:', err);
    res.status(500).json({
      error: true,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to cancel OTP request. Please try again.',
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/v1/otp/history
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Returns a paginated list of the authenticated user's OTP requests.
 * Sorted by createdAt descending (most recent first).
 *
 * Query params:
 *   page   – page number, 1-indexed (default: 1)
 *   limit  – items per page (default: 20, max: 100)
 *   status – optional filter: 'pending' | 'received' | 'failed' | 'cancelled'
 *
 * Response 200:
 * {
 *   data: OtpRequest[],
 *   pagination: {
 *     total:       number,
 *     page:        number,
 *     limit:       number,
 *     totalPages:  number,
 *     hasNextPage: boolean,
 *     hasPrevPage: boolean
 *   }
 * }
 */
router.get('/history', ...authChain, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;

    // ── Pagination params ───────────────────────────────────────────────────
    const rawPage = parseInt(req.query.page as string, 10);
    const rawLimit = parseInt(req.query.limit as string, 10);

    const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
    const limit = Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, 100) // hard cap at 100 per page
      : 20;

    const skip = (page - 1) * limit;

    // ── Optional status filter ──────────────────────────────────────────────
    const VALID_STATUSES = ['pending', 'received', 'failed', 'cancelled'] as const;
    type OtpStatus = typeof VALID_STATUSES[number];

    const statusFilter = req.query.status as string | undefined;
    const filterQuery: { userId: string; status?: OtpStatus } = { userId };

    if (statusFilter) {
      if (!VALID_STATUSES.includes(statusFilter as OtpStatus)) {
        res.status(400).json({
          error: true,
          code: 'VALIDATION_ERROR',
          message: `status must be one of: ${VALID_STATUSES.join(', ')}`,
        });
        return;
      }
      filterQuery.status = statusFilter as OtpStatus;
    }

    // ── Parallel query: data + total count ──────────────────────────────────
    const [requests, total] = await Promise.all([
      OtpRequest.find(filterQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v')   // exclude Mongoose internal version key
        .lean(),
      OtpRequest.countDocuments(filterQuery),
    ]);

    const totalPages = Math.ceil(total / limit);

    // Normalize each document — ensure price is integer (Cents Law)
    const data = requests.map((r) => ({
      requestId: r._id.toString(),
      status: r.status,
      service: r.service,
      countryCode: r.countryCode,
      price: r.price, // integer cents – guaranteed by schema validator
      createdAt: r.createdAt,
      resolvedAt: r.resolvedAt ?? null,
      // OTP only visible when delivered
      ...(r.status === 'received' && r.otp ? { otp: r.otp } : {}),
    }));

    res.status(200).json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err: any) {
    console.error('[OTP] GET /history error:', err);
    res.status(500).json({
      error: true,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to fetch OTP history. Please try again.',
    });
  }
});

export default router;
