import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export interface IPlatformRevenue extends Document {
  requestId: Types.ObjectId;
  userId: Types.ObjectId;
  providerSlug: string;
  service: string;
  countryCode: string;
  userPrice: number;      // in integer cents — Cents Law
  providerCost: number;   // in integer cents — Cents Law
  netRevenue: number;     // in integer cents — userPrice - providerCost (can be negative on refunds)
  type: 'charge' | 'refund' | 'cancellation_fee';
  createdAt: Date;
}

const centsValidator = {
  validator: Number.isInteger,
  message: '{VALUE} is not an integer. Cents Law mandates all monetary values be stored as integer cents.'
};

const PlatformRevenueSchema: Schema<IPlatformRevenue> = new Schema(
  {
    requestId: {
      type: Schema.Types.ObjectId,
      ref: 'OtpRequest',
      required: true,
      immutable: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    providerSlug: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    service: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    countryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      immutable: true,
    },
    // Cents Law: userPrice charged to the user in integer cents
    userPrice: {
      type: Number,
      required: true,
      validate: centsValidator,
      immutable: true,
    },
    // Cents Law: actual cost paid to the provider in integer cents
    providerCost: {
      type: Number,
      required: true,
      validate: centsValidator,
      immutable: true,
    },
    // Cents Law: net platform profit in integer cents.
    // NOTE: This value is NEGATIVE during refunds as the platform absorbs the provider cost.
    // Formula: netRevenue = userPrice - providerCost
    netRevenue: {
      type: Number,
      required: true,
      validate: centsValidator,
      immutable: true,
    },
    type: {
      type: String,
      enum: ['charge', 'refund', 'cancellation_fee'],
      required: true,
      immutable: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false, // Only createdAt is needed; handled manually with immutability
  }
);

// --- Indexes ---

// Time-series analysis — primary index for all dashboard revenue charts
PlatformRevenueSchema.index({ createdAt: -1 });

// Multi-dimensional indexes for Admin/SuperAdmin dashboard filtering
PlatformRevenueSchema.index({ providerSlug: 1 });
PlatformRevenueSchema.index({ service: 1 });
PlatformRevenueSchema.index({ userId: 1 });
PlatformRevenueSchema.index({ type: 1 });

const PlatformRevenue: Model<IPlatformRevenue> =
  mongoose.models.PlatformRevenue ||
  mongoose.model<IPlatformRevenue>('PlatformRevenue', PlatformRevenueSchema);

export default PlatformRevenue;
