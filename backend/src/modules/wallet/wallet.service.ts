import mongoose, { ClientSession } from 'mongoose';
import Wallet, { IWallet } from '../../models/Wallet';

/**
 * holdBalanceForRequest
 * 
 * Atomic Escrow Hold: Moves funds from 'available' to 'held' status.
 * This ensures that funds are reserved before sending a request to a provider.
 * 
 * Logic Requirements:
 * 1. Uses a MongoDB session (transaction) for atomic integrity.
 * 2. Uses findOneAndUpdate with a balance check to perform the move in one atomic step.
 * 3. Throws INSUFFICIENT_BALANCE if the user doesn't have enough available funds.
 * 4. Strictly follows THE CENTS LAW (all inputs are rounded to integers).
 * 
 * @param userId - The ID of the user whose balance is being held.
 * @param amountInCents - The amount to hold, in integer cents.
 * @returns The updated Wallet document.
 */
export const holdBalanceForRequest = async (
  userId: string,
  amountInCents: number
): Promise<IWallet> => {
  // Enforce THE CENTS LAW: Ensure the amount is a mathematically rounded integer.
  const cleanAmount = Math.round(amountInCents);

  // We start a session to ensure the operation is part of a transaction.
  const session: ClientSession = await mongoose.startSession();
  let updatedWallet: IWallet | null = null;

  try {
    // Execute the operation within a transaction.
    // session.withTransaction handles the start/commit/abort logic automatically.
    await session.withTransaction(async () => {
      updatedWallet = await Wallet.findOneAndUpdate(
        {
          userId,
          available: { $gte: cleanAmount }, // The Check: Atomic verification of funds
        },
        {
          $inc: {
            available: -cleanAmount, // The Update: Subtract from available
            held: cleanAmount,       // The Update: Add to held
          },
        },
        {
          new: true,         // Return the updated document
          session,           // Attach to the transaction session
          runValidators: true // Ensure schema constraints are respected
        }
      ).exec();

      if (!updatedWallet) {
        // If findOneAndUpdate returns null, the condition { available: { $gte: amount } } failed
        // or the wallet record does not exist for the user.
        throw new Error('INSUFFICIENT_BALANCE');
      }
    });
  } finally {
    // Always clean up the session.
    await session.endSession();
  }

  // At this point, the transaction is committed.
  // We use the non-null assertion because updatedWallet is guaranteed by the check inside the transaction.
  return updatedWallet!;
};
