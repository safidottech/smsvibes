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

/**
 * releaseEscrow
 * 
 * Finalizes a charge: Reduces the 'held' balance permanently.
 * This is called when an OTP is successfully delivered.
 * 
 * Logic:
 * 1. Uses a MongoDB session (transaction) for consistency.
 * 2. Uses findOneAndUpdate with a check to ensure 'held' balance covers the release.
 * 3. Throws INSUFFICIENT_HELD_BALANCE if the user doesn't have enough held funds.
 * 4. Strictly follows THE CENTS LAW.
 * 
 * @param userId - The ID of the user whose escrow is being released.
 * @param amountInCents - The amount to release, in integer cents.
 * @returns The updated Wallet document.
 */
export const releaseEscrow = async (
  userId: string,
  amountInCents: number
): Promise<IWallet> => {
  const cleanAmount = Math.round(amountInCents);
  const session: ClientSession = await mongoose.startSession();
  let updatedWallet: IWallet | null = null;

  try {
    await session.withTransaction(async () => {
      updatedWallet = await Wallet.findOneAndUpdate(
        {
          userId,
          held: { $gte: cleanAmount }, // The Check: Atomic verification of held funds
        },
        {
          $inc: {
            held: -cleanAmount, // The Update: Reduce held balance permanently
          },
        },
        {
          new: true,
          session,
          runValidators: true
        }
      ).exec();

      if (!updatedWallet) {
        throw new Error('INSUFFICIENT_HELD_BALANCE');
      }
    });
  } finally {
    await session.endSession();
  }

  return updatedWallet!;
};

/**
 * refundEscrow
 * 
 * Restores funds: Moves money from 'held' status back to 'available' status.
 * This is triggered when an OTP request fails across all providers or is cancelled.
 * 
 * Logic:
 * 1. Uses a MongoDB session (transaction) for atomic integrity.
 * 2. Uses findOneAndUpdate with a check to ensure 'held' balance covers the refund.
 * 3. Throws INSUFFICIENT_HELD_BALANCE if the user doesn't have enough held funds.
 * 4. Strictly follows THE CENTS LAW.
 * 
 * @param userId - The ID of the user whose escrow is being refunded.
 * @param amountInCents - The amount to refund, in integer cents.
 * @returns The updated Wallet document.
 */
export const refundEscrow = async (
  userId: string,
  amountInCents: number
): Promise<IWallet> => {
  const cleanAmount = Math.round(amountInCents);
  const session: ClientSession = await mongoose.startSession();
  let updatedWallet: IWallet | null = null;

  try {
    await session.withTransaction(async () => {
      updatedWallet = await Wallet.findOneAndUpdate(
        {
          userId,
          held: { $gte: cleanAmount }, // The Check: Atomic verification of held funds
        },
        {
          $inc: {
            available: cleanAmount, // The Update: Restore to available
            held: -cleanAmount,      // The Update: Remove from held
          },
        },
        {
          new: true,
          session,
          runValidators: true
        }
      ).exec();

      if (!updatedWallet) {
        throw new Error('INSUFFICIENT_HELD_BALANCE');
      }
    });
  } finally {
    await session.endSession();
  }

  return updatedWallet!;
};
