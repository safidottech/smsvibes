import { Schema, model, Document, Types } from 'mongoose';

/**
 * ITransaction Interface
 * Represents a single entry in the immutable financial ledger.
 */
export interface ITransaction extends Document {
  userId: Types.ObjectId;
  type: 'topup' | 'charge' | 'refund' | 'cancellation_fee' | 'withdrawal';
  amount: number; // Integer USD cents (Cents Law)
  requestId?: Types.ObjectId | null;
  paymentId?: string | null;
  paymentStatus?: 'pending' | 'confirmed' | 'expired' | 'partial';
  expiresAt?: Date | null;
  note?: string | null;
  createdAt: Date;
}

/**
 * Transaction Schema
 */
const TransactionSchema = new Schema<ITransaction>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  type: {
    type: String,
    enum: ['topup', 'charge', 'refund', 'cancellation_fee', 'withdrawal'],
    required: [true, 'Transaction type is required'],
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    validate: {
      validator: Number.isInteger,
      message: 'Cents Law Violation: Amount must be an integer (cents)',
    },
  },
  requestId: {
    type: Schema.Types.ObjectId,
    ref: 'OtpRequest',
    default: null,
  },
  paymentId: {
    type: String,
    unique: true,
    sparse: true, // Allows multiple nulls while enforcing uniqueness on non-null values
    default: null,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'expired', 'partial'],
    default: 'pending',
  },
  expiresAt: {
    type: Date,
    default: null,
  },
  note: {
    type: String,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// --- IMMUTABILITY GUARDS ---

/**
 * Prevent updates to existing transactions.
 * Transactions must only be created, never modified.
 */
TransactionSchema.pre('save', async function () {
  if (!this.isNew) {
    throw new Error('Financial Integrity Error: Transactions are immutable and cannot be updated.');
  }
});

/**
 * Prevent update operations at the query level.
 */
TransactionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  throw new Error('Financial Integrity Error: Update operations on the Transaction collection are strictly prohibited.');
});

// --- MANDATORY INDEXES ---

// Unique sparse index for webhook deduplication (NOWPayments/Stripe)
// This is already handled by 'unique: true, sparse: true' in the field definition,
// but explicitly defining it here for clarity in the manifest.
TransactionSchema.index({ paymentId: 1 }, { unique: true, sparse: true });

// Basic lookup indexes
TransactionSchema.index({ userId: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ createdAt: -1 });

// Compound index for optimized user transaction history
TransactionSchema.index({ userId: 1, createdAt: -1 });

const Transaction = model<ITransaction>('Transaction', TransactionSchema);

export default Transaction;
