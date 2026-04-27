import crypto from 'crypto';
import bcrypt from 'bcrypt';
import User from '../../models/User';
import { emailNotificationsQueue } from '../../config/bullmq';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Token TTL: 1 hour in milliseconds. */
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1_000;

/** Frontend reset-password page base URL (set in environment). */
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://smsvibes.com';

// ─── Response Interfaces ──────────────────────────────────────────────────────

export interface RequestPasswordResetResponse {
  success: true;
  message: string;
}

export interface ResetPasswordResponse {
  success: true;
  message: string;
}

// ─── Service Functions ────────────────────────────────────────────────────────

/**
 * requestPasswordReset
 *
 * Accepts an email address and — regardless of whether that email exists in the
 * database — always returns a success response (PRD §13.3, Security §9.4: do
 * not reveal user existence).
 *
 * When the user IS found:
 *   1. Generates a 32-byte cryptographically secure hex token.
 *   2. Stores a bcrypt hash of the token + a 1-hour expiry on the User doc.
 *   3. Enqueues a `send-password-reset` job on the `email-notifications` queue.
 */
export const requestPasswordReset = async (
  email: string
): Promise<RequestPasswordResetResponse> => {
  // Always respond with success — prevents user-enumeration attacks.
  const SAFE_RESPONSE: RequestPasswordResetResponse = {
    success: true,
    message:
      'If an account exists for that email, a reset link has been sent.',
  };

  // Silently return if no user found (no indication to caller).
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    return SAFE_RESPONSE;
  }

  // 1. Generate a cryptographically secure 32-byte hex token (64 chars).
  const rawToken = crypto.randomBytes(32).toString('hex');

  // 2. Hash the token before persisting — only the hash is stored (§9.4).
  //    12 rounds matches the project-wide password-hashing standard.
  const tokenHash = await bcrypt.hash(rawToken, 12);

  // 3. Persist hash + expiry on the User document (no session needed — single doc update).
  user.passwordResetToken = tokenHash;
  user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
  await user.save();

  // 4. Queue the email — worker will dispatch via Resend adapter.
  //    The raw token (NOT the hash) is included in the reset link so the
  //    user can present it back for bcrypt comparison on reset.
  const resetLink = `${FRONTEND_URL}/auth/reset-password?token=${rawToken}`;

  await emailNotificationsQueue.add('send-password-reset', {
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    resetLink,
  });

  return SAFE_RESPONSE;
};

/**
 * resetPassword
 *
 * Accepts a raw reset token (from the email link) and the user's new password.
 *
 * Validation:
 *   - Finds users whose `passwordResetExpires` is still in the future.
 *   - Iterates candidates and bcrypt-compares the raw token against stored hashes.
 *     (Candidate set is always tiny — tokens expire in 1 hour.)
 *
 * On success:
 *   - Hashes the new password (12 rounds) and writes it to `passwordHash`.
 *   - Clears `passwordResetToken` and `passwordResetExpires`.
 *
 * Throws:
 *   - `INVALID_OR_EXPIRED_TOKEN` — token not found, already used, or expired.
 *   - `INVALID_PASSWORD` — new password does not meet minimum length requirement.
 */
export const resetPassword = async (
  token: string,
  newPassword: string
): Promise<ResetPasswordResponse> => {
  // Basic password validation before any DB work.
  if (!newPassword || newPassword.length < 8) {
    throw new Error('INVALID_PASSWORD');
  }

  // Fetch all users with a non-expired reset token.
  // This set is intentionally tiny (tokens last only 1 hour).
  const candidates = await User.find({
    passwordResetToken: { $ne: null },
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');

  // Find the user whose stored hash matches the raw token provided.
  let matchedUser: (typeof candidates)[number] | null = null;

  for (const candidate of candidates) {
    if (!candidate.passwordResetToken) continue;

    const isMatch = await bcrypt.compare(token, candidate.passwordResetToken);
    if (isMatch) {
      matchedUser = candidate;
      break;
    }
  }

  if (!matchedUser) {
    throw new Error('INVALID_OR_EXPIRED_TOKEN');
  }

  // Hash the new password at 12 salt rounds (§9.4).
  const newPasswordHash = await bcrypt.hash(newPassword, 12);

  // Update the document: set new password hash, clear reset fields atomically.
  matchedUser.passwordHash = newPasswordHash;
  matchedUser.passwordResetToken = null;
  matchedUser.passwordResetExpires = null;
  await matchedUser.save();

  return { success: true, message: 'Password has been reset successfully.' };
};
