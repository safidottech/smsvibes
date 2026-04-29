import User from '../../models/User';
import Wallet, { IWallet } from '../../models/Wallet';
import AuditLog from '../../models/AuditLog';
import { recordTransaction } from '../wallet/transaction.service';
import { ITransaction } from '../../models/Transaction';

/**
 * Interface for the manual top-up return object.
 */
export interface IManualTopupResponse {
  updatedWallet: IWallet;
  transaction: ITransaction;
}

/**
 * Admin Service: manualTopup
 * 
 * Allows an authorized administrator to manually credit a user's account balance.
 * This operation is fully audited and recorded in the immutable ledger.
 * 
 * @param adminId - The ID of the admin performing the action.
 * @param targetUserId - The ID of the user receiving the funds.
 * @param amountCents - The amount to credit in integer cents (The Cents Law).
 * @param note - Optional administrative note for the transaction and audit log.
 * @returns The updated wallet document and the transaction record.
 */
export const manualTopup = async (
  adminId: string,
  targetUserId: string,
  amountCents: number,
  note?: string
): Promise<IManualTopupResponse> => {
  // 1. Verify Admin Authority
  const admin = await User.findById(adminId);
  if (!admin || (admin.role !== 'admin' && admin.role !== 'superadmin')) {
    throw new Error('UNAUTHORIZED_ADMIN');
  }

  // 2. Fetch Target User (for Audit Log visibility)
  const targetUser = await User.findById(targetUserId);
  if (!targetUser) {
    throw new Error('TARGET_USER_NOT_FOUND');
  }

  // 3. The Cents Law: Ensure integer cents processing
  const roundedAmount = Math.round(amountCents);

  /**
   * 4. Atomic Balance Update
   * We use $inc to ensure the update is atomic and thread-safe.
   * Upsert is set to true to ensure a wallet exists for the user if it didn't already.
   */
  const updatedWallet = await Wallet.findOneAndUpdate(
    { userId: targetUserId },
    { $inc: { available: roundedAmount } },
    { new: true, upsert: true }
  );

  if (!updatedWallet) {
    throw new Error('WALLET_UPDATE_FAILED');
  }

  /**
   * 5. Immutable Ledger: Record the Transaction
   * This maintains a permanent record of the top-up in the Transaction collection.
   */
  const transaction = await recordTransaction({
    userId: targetUserId,
    type: 'topup',
    amount: roundedAmount,
    note: note || `Manual top-up by admin (${admin.email})`,
  });

  /**
   * 6. Silent Accountability: Create Audit Log
   * Every administrative action must be recorded for security compliance.
   */
  await AuditLog.log({
    adminId: admin._id,
    adminEmail: admin.email,
    actionType: 'BALANCE_CREDITED',
    targetId: targetUser._id,
    targetEmail: targetUser.email,
    detail: `Amount: ${roundedAmount} cents. Note: ${note || 'N/A'}`,
    ipAddress: '127.0.0.1', // Placeholder as IP is not provided in function signature; usually handled by request context
  });

  return {
    updatedWallet,
    transaction,
  };
};
