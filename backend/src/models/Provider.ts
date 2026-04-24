import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IProvider extends Document {
  name: string;
  slug: string;
  apiKey: string; // Note: Stored as AES-256 encrypted ciphertext
  baseUrl: string;
  isActive: boolean;
  priority: number;
  successRate: number;
  avgDeliveryTime: number;
  totalRequests: number;
  createdAt: Date;
  updatedAt: Date;
}

const ProviderSchema: Schema<IProvider> = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    apiKey: {
      type: String,
      required: true,
      // SECURITY REQUIREMENT: Expects AES-256 encrypted ciphertext, NOT plaintext.
      // Encryption/decryption is typically handled at the service layer or via custom Mongoose setter/getter.
    },
    baseUrl: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    priority: {
      type: Number,
      default: 1,
    },
    successRate: {
      type: Number,
      default: 100, // Optimistic default
    },
    avgDeliveryTime: {
      type: Number,
      default: 0,
    },
    totalRequests: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
// 1. Fast lookups for specific providers by their slug
// Mongoose creates a unique index automatically for `unique: true`, but defining it here explicitly ensures clarity.
ProviderSchema.index({ slug: 1 }, { unique: true });

// 2. Compound index for failover selection logic
// Allows querying active providers sorted by priority with high performance
ProviderSchema.index({ isActive: 1, priority: 1 });

const Provider: Model<IProvider> = mongoose.models.Provider || mongoose.model<IProvider>('Provider', ProviderSchema);

export default Provider;
