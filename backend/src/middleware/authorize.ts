import { Request, Response, NextFunction } from 'express';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Supported platform roles.
 * Mirrors the 'role' field enum defined in backend/src/models/User.ts
 */
export type UserRole = 'superadmin' | 'admin' | 'user';

/**
 * Supported account types.
 * Mirrors the 'accountType' field enum defined in backend/src/models/User.ts
 * Used to gate developer-specific (B2B) routes.
 */
export type AccountType = 'b2c' | 'b2b';

/**
 * Shape of the authenticated user object attached to `req.user`
 * by the preceding `authenticate` middleware.
 *
 * This augments the Express Request interface so TypeScript can
 * resolve `req.user` without casting throughout the codebase.
 */
export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  accountType: AccountType;
}

/**
 * Extended Express Request that carries the authenticated user.
 * Route handlers that sit behind `authenticate` + `authorize` can
 * import and use this type directly for full type-safety.
 */
export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

// ============================================================================
// ERROR RESPONSE HELPERS
// ============================================================================

/** Standardized error response shape per SMSVIBES Technical Architecture v2.0 */
interface ErrorResponse {
  error: true;
  code: string;
  message: string;
}

const FORBIDDEN: ErrorResponse = {
  error: true,
  code: 'FORBIDDEN',
  message: 'You do not have permission to perform this action',
};

const UNAUTHENTICATED: ErrorResponse = {
  error: true,
  code: 'UNAUTHENTICATED',
  message: 'Authentication is required to access this resource',
};

// ============================================================================
// AUTHORIZE FACTORY
// ============================================================================

/**
 * ## authorize – RBAC Middleware Factory
 *
 * ### Pattern: Middleware Factory (Closure)
 * `authorize()` is a *factory function* — calling it with a set of allowed
 * roles returns a new Express middleware closure that captures those roles via
 * closure scope. This keeps route definitions declarative and self-documenting:
 *
 * ```ts
 * router.delete('/users/:id', authenticate, authorize('superadmin'), handler);
 * ```
 *
 * ### Execution Contract
 * This middleware MUST be placed **after** `authenticate` in the chain.
 * `authenticate` is responsible for verifying the JWT and attaching
 * `req.user`. If `req.user` is absent when `authorize` runs, it means
 * the request was never authenticated and a 401 is returned immediately.
 *
 * ### Privilege Escalation Prevention
 * Role checks are performed via an explicit allowlist (`allowedRoles`).
 * Any role NOT in the list is denied — there are no implicit promotions.
 *
 * @param allowedRoles - One or more roles permitted to access the route.
 * @param options.requireB2B - When `true`, additionally requires the user's
 *   `accountType` to be `'b2b'`. Use this to gate developer/API routes.
 *   Defaults to `false`.
 *
 * @returns Express `RequestHandler` that either calls `next()` on success
 *   or terminates the request with a structured JSON error.
 *
 * @example
 * // Admin-only route
 * router.get('/admin/dashboard', authenticate, authorize('superadmin', 'admin'), getDashboard);
 *
 * @example
 * // SuperAdmin-only route  (red-signal per architecture doc)
 * router.delete('/admin/users/:id', authenticate, authorize('superadmin'), deleteUser);
 *
 * @example
 * // B2B developer API route (role + accountType gate)
 * router.post('/api/v1/otp/send', authenticate, authorize('user', { requireB2B: true }), sendOtp);
 */
export function authorize(
  ...args: [...roles: UserRole[]] | [...roles: UserRole[], options: { requireB2B?: boolean }]
) {
  // Separate positional role strings from the optional trailing options object
  let allowedRoles: UserRole[];
  let requireB2B = false;

  const lastArg = args[args.length - 1];

  if (
    lastArg !== null &&
    typeof lastArg === 'object' &&
    !Array.isArray(lastArg)
  ) {
    // Last argument is the options object
    const options = lastArg as { requireB2B?: boolean };
    requireB2B = options.requireB2B ?? false;
    allowedRoles = args.slice(0, -1) as UserRole[];
  } else {
    allowedRoles = args as UserRole[];
  }

  // ── Returned middleware closure ──────────────────────────────────────────
  return function authorizeMiddleware(
    req: AuthRequest,
    res: Response,
    next: NextFunction,
  ): void {
    // Guard: authenticate middleware must have run first
    if (!req.user) {
      res.status(401).json(UNAUTHENTICATED);
      return;
    }

    const { role, accountType } = req.user;

    // ── Role check ─────────────────────────────────────────────────────────
    // Explicit allowlist — any unlisted role is implicitly denied.
    if (!allowedRoles.includes(role)) {
      res.status(403).json(FORBIDDEN);
      return;
    }

    // ── Optional B2B account-type gate ────────────────────────────────────
    // Used to restrict developer-specific (API/webhook) routes to B2B accounts
    // while still allowing admins/superadmins through regardless of accountType.
    if (requireB2B && accountType !== 'b2b') {
      res.status(403).json({
        error: true,
        code: 'FORBIDDEN',
        message: 'This endpoint is restricted to B2B accounts only',
      } satisfies ErrorResponse);
      return;
    }

    // ── All checks passed — proceed to next handler ────────────────────────
    next();
  };
}
