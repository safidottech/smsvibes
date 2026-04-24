import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IProviderWallet extends Document {
  providerSlug: string;
  cachedBalance: number;
  lowBalanceThreshold: number;
  lastCheckedAt: Date | null;
  isAlertSent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProviderWalletSchema: Schema<IProviderWallet> = new Schema(
  {
    providerSlug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    // CONVERSION NOTE: Balances returned by third-party provider APIs (usually in USD or local currency floats)
    // MUST be converted to integer cents before saving to the database to satisfy the Cents Law ($1.00 = 100 cents).
    cachedBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer. Cents Law mandates integer cents for cachedBalance.'
      }
    },
    lowBalanceThreshold: {
      type: Number,
      required: true,
      default: 1000, // e.g., $10.00
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer. Cents Law mandates integer cents for lowBalanceThreshold.'
      }
    },
    lastCheckedAt: {
      type: Date,
      default: null,
    },
    isAlertSent: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // Automatically manages createdAt and updatedAt
  }
);

// --- Indexes ---

// Unique index for ultra-fast lookups by the background balance monitor worker.
// Automatically handled by `unique: true` but explicitly defined for clarity.
ProviderWalletSchema.index({ providerSlug: 1 }, { unique: true });

const ProviderWallet: Model<IProviderWallet> = mongoose.models.ProviderWallet || mongoose.model<IProviderWallet>('ProviderWallet', ProviderWalletSchema);

export default ProviderWallet;
