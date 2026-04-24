import mongoose, { Document, Schema, Model } from 'mongoose';

export interface IProviderCost {
  provider: string;
  cost: number; // in cents
}

export interface IPricing extends Document {
  serviceId: string;
  countryCode: string;
  countryName: string;
  flag: string;
  providerCosts: IProviderCost[];
  highestCost: number;       // in cents
  markupPercent: number;
  failureRateBuffer: number;
  userPrice: number;         // in cents
  isActive: boolean;
  updatedAt: Date;
}

const ProviderCostSchema = new Schema<IProviderCost>(
  {
    provider: { 
      type: String, 
      required: true, 
      trim: true 
    },
    cost: { 
      type: Number, 
      required: true, 
      min: 0, 
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer. All monetary values must follow the Cents Law.'
      } 
    },
  },
  { _id: false }
);

const PricingSchema: Schema<IPricing> = new Schema(
  {
    serviceId: {
      type: String,
      required: true,
      ref: 'Service',
      trim: true,
    },
    countryCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    countryName: {
      type: String,
      required: true,
      trim: true,
    },
    flag: {
      type: String,
      required: true,
      trim: true,
    },
    providerCosts: {
      type: [ProviderCostSchema],
      required: true,
      default: [],
    },
    highestCost: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer. All monetary values must follow the Cents Law.'
      }
    },
    markupPercent: {
      type: Number,
      required: true,
      default: 120,
    },
    failureRateBuffer: {
      type: Number,
      required: true,
      default: 0,
    },
    userPrice: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer. All monetary values must follow the Cents Law.'
      }
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
  }
);

// Indexes
// 1. Unique Compound Index to prevent duplicate pricing entries for the same service in the same country.
PricingSchema.index({ serviceId: 1, countryCode: 1 }, { unique: true });
// 2. Index for filtering active prices.
PricingSchema.index({ isActive: 1 });
// 3. Index for fast querying/sorting by user price.
PricingSchema.index({ userPrice: 1 });

// Pre-validate Hook: Implement the Failure Buffer Pricing Formula
// We use 'validate' instead of 'save' so that computed required fields (highestCost, userPrice)
// are populated before Mongoose performs its built-in validation checks.
PricingSchema.pre<IPricing>('validate', async function () {
  // 1. Automatically derive highestCost from providerCosts array
  if (this.providerCosts && this.providerCosts.length > 0) {
    const costs = this.providerCosts.map((p) => p.cost);
    this.highestCost = Math.max(...costs);
  } else {
    this.highestCost = this.highestCost || 0;
  }

  // Fallback defaults in case they aren't explicitly provided (though schema has defaults)
  const buffer = this.failureRateBuffer !== undefined ? this.failureRateBuffer : 0;
  const markup = this.markupPercent !== undefined ? this.markupPercent : 120;

  // 2. Apply the Failure Buffer Formula
  // adjustedBase = highestCost + (highestCost * failureRateBuffer)
  const adjustedBase = this.highestCost + (this.highestCost * buffer);
  
  // userPrice = Math.round(adjustedBase * (markupPercent / 100))
  this.userPrice = Math.round(adjustedBase * (markup / 100));

  // 3. Update the timestamp
  this.updatedAt = new Date();
});

const Pricing: Model<IPricing> = mongoose.models.Pricing || mongoose.model<IPricing>('Pricing', PricingSchema);

export default Pricing;
