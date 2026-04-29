import Transaction, { ITransaction } from '../../models/Transaction';
import mongoose from 'mongoose';

/**
 * Interface for the recordTransaction input data.
 * Adheres to strict typing for the immutable ledger.
 */
export interface ITransactionData {
  userId: mongoose.Types.ObjectId | string;
  type: 'topup' | 'charge' | 'refund' | 'cancellation_fee' | 'withdrawal';
  amount: number; // Integer cents (The Cents Law)
  requestId?: mongoose.Types.ObjectId | string;
  paymentId?: string;
  paymentStatus?: 'pending' | 'confirmed' | 'expired' | 'partial';
  note?: string;
}

/**
 * Records a new transaction in the immutable ledger.
 * 
 * @description
 * This function is the primary entry point for recording financial movements.
 * It strictly follows "The Cents Law" by rounding the amount to the nearest integer.
 * It is an "Insert-Only" operation, leveraging Transaction.create() to ensure 
 * the model's immutability guards are triggered.
 * 
 * IMPORTANT: This service is for ledger recording only. Balance updates 
 * must be handled separately by the WalletService to maintain separation of concerns.
 * 
 * @param data - The transaction metadata and amount in cents.
 * @returns The newly created Transaction document.
 */
export const recordTransaction = async (data: ITransactionData): Promise<ITransaction> => {
  // The Cents Law: Ensure the amount is mathematically rounded to an integer.
  // This prevents floating point errors from polluting the ledger.
  const sanitizedAmount = Math.round(data.amount);

  // Use Transaction.create() to insert the record.
  // This triggers the 'pre-save' hooks in the model which enforce immutability via !this.isNew.
  const transaction = await Transaction.create({
    ...data,
    amount: sanitizedAmount,
  });

  return transaction;
};