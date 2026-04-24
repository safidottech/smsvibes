import mongoose, { Document, Schema, Model, Types } from 'mongoose';

export const AuditActionTypes = [
  'USER_SUSPENDED', 'USER_BANNED', 'USER_UNBANNED', 
  'BALANCE_CREDITED', 'WITHDRAWAL_APPROVED', 'WITHDRAWAL_REJECTED', 
  'PROVIDER_ENABLED', 'PROVIDER_DISABLED', 'PROVIDER_ADDED', 'PROVIDER_EDITED', 
  'PRICING_MARKUP_CHANGED', 'PRICING_SERVICE_OVERRIDDEN', 
  'TICKET_REPLIED', 'TICKET_STATUS_CHANGED', 'TICKET_RESOLVED', 
  'ADMIN_LOGIN', 'ADMIN_LOGOUT'
] as const;

export type AuditActionType = typeof AuditActionTypes[number];

export interface IAuditLog extends Document {
  adminId: Types.ObjectId;
  adminEmail: string;
  actionType: AuditActionType;
  targetId?: Types.ObjectId;
  targetEmail?: string;
  detail: string;
  ipAddress: string;
  createdAt: Date;
}

export interface IAuditLogModel extends Model<IAuditLog> {
  log(data: {
    adminId: Types.ObjectId | string;
    adminEmail: string;
    actionType: AuditActionType;
    targetId?: Types.ObjectId | string;
    targetEmail?: string;
    detail: string;
    ipAddress: string;
  }): Promise<IAuditLog>;
}

const AuditLogSchema = new Schema<IAuditLog, IAuditLogModel>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      immutable: true,
    },
    adminEmail: {
      type: String,
      required: true,
      trim: true,
      immutable: true,
    },
    actionType: {
      type: String,
      enum: AuditActionTypes,
      required: true,
      immutable: true,
    },
    targetId: {
      type: Schema.Types.ObjectId,
      immutable: true, // Only applicable if provided
    },
    targetEmail: {
      type: String,
      trim: true,
      immutable: true,
    },
    detail: {
      type: String,
      required: true,
      immutable: true,
    },
    ipAddress: {
      type: String,
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
    timestamps: false,
  }
);

// --- Indexes ---
AuditLogSchema.index({ adminId: 1 });
AuditLogSchema.index({ actionType: 1 });
AuditLogSchema.index({ createdAt: -1 });
// Compound index for SuperAdmin filters (finding actions by a specific admin sorted by time)
AuditLogSchema.index({ adminId: 1, createdAt: -1 });

// --- Guard Logic: Immutability Enforcements ---

// 1. Prevent updates on document saves
AuditLogSchema.pre('save', async function () {
  if (!this.isNew) {
    throw new Error('Audit logs are strictly insert-only. Update operations are rejected.');
  }
});

// 2. Prevent query-level updates and deletes
const preventModification = async function () {
  throw new Error('Audit logs are strictly insert-only. Update and Delete operations are rejected by the system.');
};

// Bind the guard to all modification queries
AuditLogSchema.pre('findOneAndUpdate', preventModification as any);
AuditLogSchema.pre('updateMany', preventModification as any);
AuditLogSchema.pre('updateOne', preventModification as any);
AuditLogSchema.pre('findOneAndDelete', preventModification as any);
AuditLogSchema.pre('deleteOne', preventModification as any);
AuditLogSchema.pre('deleteMany', preventModification as any);
AuditLogSchema.pre('findOneAndReplace', preventModification as any);

// --- Static Helpers ---

// A static helper for simplified one-line logging throughout the application
AuditLogSchema.statics.log = async function (data) {
  return await this.create(data);
};

const AuditLog = mongoose.models.AuditLog as IAuditLogModel || mongoose.model<IAuditLog, IAuditLogModel>('AuditLog', AuditLogSchema);

export default AuditLog;
