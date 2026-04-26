import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../../models/User';

// ─── Response Shape ──────────────────────────────────────────────────────────

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    accountType: string;
  };
}

// ─── Pure Service Function ───────────────────────────────────────────────────

/**
 * loginUser
 *
 * Authenticates a user with email + password credentials.
 * Performs the following checks in order:
 *   1. User existence
 *   2. Password verification (bcrypt)
 *   3. Email verification status
 *   4. Account suspension / ban status
 *
 * On success, issues a signed JWT and updates `lastLoginAt`.
 *
 * Throws semantic error codes so the controller can map them to HTTP responses:
 *   INVALID_CREDENTIALS  – user not found OR password mismatch
 *   EMAIL_NOT_VERIFIED   – email address has not been confirmed yet
 *   ACCOUNT_SUSPENDED    – account is temporarily suspended
 *   ACCOUNT_BANNED       – account is permanently banned
 */
export const loginUser = async (
  email: string,
  password: string
): Promise<LoginResponse> => {
  // ── 1. Basic input guard ────────────────────────────────────────────────
  if (!email || !password) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // ── 2. Find user by email ───────────────────────────────────────────────
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select(
    '+passwordHash' // passwordHash may be select:false on the model
  );

  if (!user) {
    // Use a generic error to prevent user-enumeration attacks
    throw new Error('INVALID_CREDENTIALS');
  }

  // ── 3. Verify password ──────────────────────────────────────────────────
  if (!user.passwordHash) {
    // Account registered via OAuth only — no local password set
    throw new Error('INVALID_CREDENTIALS');
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    throw new Error('INVALID_CREDENTIALS');
  }

  // ── 4. Email verification check ─────────────────────────────────────────
  if (!user.isEmailVerified) {
    throw new Error('EMAIL_NOT_VERIFIED');
  }

  // ── 5. Account status checks ────────────────────────────────────────────
  if (user.isSuspended) {
    throw new Error('ACCOUNT_SUSPENDED');
  }

  if (user.isBanned) {
    throw new Error('ACCOUNT_BANNED');
  }

  // ── 6. Issue JWT ────────────────────────────────────────────────────────
  const jwtSecret = process.env.JWT_SECRET;
  const jwtExpiresIn = (process.env.JWT_EXPIRES_IN as string) || '7d';

  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('SERVER_CONFIGURATION_ERROR');
  }

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      accountType: user.accountType,
    },
    jwtSecret,
    { expiresIn: jwtExpiresIn }
  );

  // ── 7. Update lastLoginAt (fire-and-forget; non-blocking) ───────────────
  User.findByIdAndUpdate(user._id, { lastLoginAt: new Date() }).exec().catch(
    (err) => console.error('[loginUser] Failed to update lastLoginAt:', err)
  );

  // ── 8. Return token + public user shape ─────────────────────────────────
  return {
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      accountType: user.accountType,
    },
  };
};
