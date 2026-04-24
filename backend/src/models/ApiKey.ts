import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IApiKey extends Document {
  userId: Types.ObjectId;
  name: string;
  keyPrefix: string;
  keyHash: string;
  isActive: boolean;
  lastUsedAt: Date | null;
  requestCount: number;
  revokedAt: Date | null;
  createdAt: Date;
}

const ApiKeySchema: Schema<IApiKey> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // SECURITY NOTE: The raw API key must only be shown to the user ONCE upon creation 
    // and must NEVER be stored in plain text in the database. Only the prefix and hash are kept.
    keyPrefix: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 8,
    },
    keyHash: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    requestCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Keeping timestamps false as only custom date fields were requested
    timestamps: false,
  }
);

// Indexes
// 1. Fast lookup index used on every incoming API request to identify the potential key.
ApiKeySchema.index({ keyPrefix: 1 });
// 2. Index to efficiently list all API keys belonging to a specific user.
ApiKeySchema.index({ userId: 1 });

const ApiKey: Model<IApiKey> = mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);

export default ApiKey;
