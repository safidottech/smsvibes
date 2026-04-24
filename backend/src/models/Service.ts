import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IService extends Document {
  serviceId: string;
  name: string;
  icon: string;
  isActive: boolean;
  createdAt: Date;
}

const ServiceSchema: Schema<IService> = new Schema(
  {
    serviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    icon: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Omitting standard Mongoose timestamps since only createdAt is specified
    timestamps: false,
  }
);

// Indexes
// Unique index for fast lookups during request creation.
// Mongoose creates a unique index automatically for `unique: true`, but explicitly defining it is good practice.
ServiceSchema.index({ serviceId: 1 }, { unique: true });

const Service: Model<IService> = mongoose.models.Service || mongoose.model<IService>('Service', ServiceSchema);

export default Service;
