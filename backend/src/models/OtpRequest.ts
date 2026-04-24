import { Schema, model, Document, Types } from 'mongoose';

/**
 * IAttempt Interface
 * Represents a single provider attempt within an OTP request lifecycle.
 */
export interface IAttempt {
  provider: string;
  startedAt: Date;
  result: 'timeout' | 'success' | 'error';
  timedOutAt?: Date | null;
  deliveredAt?: Date | null;
}

/**
 * IOtpRequest Interface
 * Core document structure for OTP requests.
 */
export interface IOtpRequest extends Document {
  userId: Types.ObjectId;
  service: string;
  countryCode: string;
  status: 'pending' | 'received' | 'failed' | 'cancelled';
  price: number; // Integer USD cents (Cents Law)
  otp?: string | null;
  phoneNumber?: string | null;
  attempts: IAttempt[];
  createdAt: Date;
  resolvedAt?: Date | null;
}

/**
 * Attempt Sub-Schema
 */
const AttemptSchema = new Schema<IAttempt>({
  provider: {
    type: String,
    required: [true, 'Provider is required'],
  },
  startedAt: {
    type: Date,
    default: Date.now,
  },
  result: {
    type: String,
    enum: ['timeout', 'success', 'error'],
    required: [true, 'Attempt result is required'],
  },
  timedOutAt: {
    type: Date,
    default: null,
  },
  deliveredAt: {
    type: Date,
    default: null,
  },
}, { _id: false });

/**
 * OtpRequest Schema
 */
const OtpRequestSchema = new Schema<IOtpRequest>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required'],
  },
  service: {
    type: String,
    required: [true, 'Service name is required (e.g., whatsapp)'],
  },
  countryCode: {
    type: String,
    required: [true, 'Country code is required (e.g., PK)'],
  },
  status: {
    type: String,
    enum: ['pending', 'received', 'failed', 'cancelled'],
    default: 'pending',
    required: true,
  },
  price: {
    type: Number,
    required: [true, 'Price is required'],
    validate: {
      validator: Number.isInteger,
      message: 'Cents Law Violation: Price must be an integer (cents)',
    },
  },
  otp: {
    type: String,
    default: null,
  },
  phoneNumber: {
    type: String,
    default: null,
  },
  attempts: {
    type: [AttemptSchema],
    validate: {
      validator: (val: IAttempt[]) => val.length <= 3,
      message: 'Failover Limit: Maximum 3 provider attempts allowed',
    },
    default: [],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  resolvedAt: {
    type: Date,
    default: null,
  },
});

// --- MANDATORY INDEXES ---

// For fetching user's request history
OtpRequestSchema.index({ userId: 1 });

// For operational status monitoring
OtpRequestSchema.index({ status: 1 });

// For global history sorting (latest first)
OtpRequestSchema.index({ createdAt: -1 });

// Compound index for active user requests (performance critical for UI state)
OtpRequestSchema.index({ userId: 1, status: 1 });

const OtpRequest = model<IOtpRequest>('OtpRequest', OtpRequestSchema);

export default OtpRequest;
