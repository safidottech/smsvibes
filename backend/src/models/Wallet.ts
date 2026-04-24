import mongoose, { Document, Schema } from 'mongoose';

export interface IWallet extends Document {
  userId: mongoose.Types.ObjectId;
  available: number;
  held: number;
  createdAt: Date;
  updatedAt: Date;
}

// Setter helper function to enforce the Cents Law.
// Ensures that any incoming value is mathematically rounded to the nearest integer.
// This prevents floating-point inaccuracies from persisting in the database.
const toIntegerCents = (val: number): number => Math.round(val);

const WalletSchema = new Schema<IWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // Automatically creates the { userId: 1 } unique index
    },
    available: {
      type: Number,
      required: true,
      default: 0,
      set: toIntegerCents,
    },
    held: {
      type: Number,
      required: true,
      default: 0,
      set: toIntegerCents,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/**
 * Virtual property: totalBalance
 * Calculated at runtime as `available + held`. 
 * We do not store this in the database to prevent synchronization bugs 
 * where the sum of `available` and `held` could mathematically diverge 
 * from a static `total_balance` field during complex transactions.
 */
WalletSchema.virtual('totalBalance').get(function() {
  return this.available + this.held;
});

const Wallet = mongoose.model<IWallet>('Wallet', WalletSchema);

export default Wallet;
