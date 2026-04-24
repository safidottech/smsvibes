import mongoose, { Document, Schema, Model, Types } from 'mongoose';

// --- Embedded Interfaces ---

export interface IMessage {
  sender: 'user' | 'admin';
  text: string;
  createdAt: Date;
}

export interface IInternalNote {
  adminId: Types.ObjectId; // References the Admin User who left the note
  text: string;
  createdAt: Date;
}

// --- Main Interface ---

export interface ISupportTicket extends Document {
  userId: Types.ObjectId; // References the User who created the ticket
  subject: string;
  category: 'billing' | 'otp_issue' | 'technical' | 'account' | 'other';
  status: 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
  messages: IMessage[];
  internalNotes: IInternalNote[];
  createdAt: Date;
  updatedAt: Date;
}

// --- Embedded Schemas ---

const MessageSchema = new Schema<IMessage>(
  {
    sender: {
      type: String,
      enum: ['user', 'admin'],
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true } // Keep _id for individual message referencing
);

const InternalNoteSchema = new Schema<IInternalNote>(
  {
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// --- Main Schema ---

const SupportTicketSchema: Schema<ISupportTicket> = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ['billing', 'otp_issue', 'technical', 'account', 'other'],
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'waiting', 'resolved', 'closed'],
      default: 'open',
      required: true,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
    internalNotes: {
      type: [InternalNoteSchema],
      default: [],
      // Security enhancement: Prevent accidental leakage to user endpoints
      select: false, 
    },
  },
  {
    timestamps: true, // Enables automatic createdAt and updatedAt
  }
);

// --- Indexes ---

// 1. For fetching user-specific ticket history.
SupportTicketSchema.index({ userId: 1 });

// 2. For administrative queue management (e.g., finding "waiting" tickets for the auto-close cron job).
SupportTicketSchema.index({ status: 1 });

// 3. For sorting the ticket queue by age.
SupportTicketSchema.index({ createdAt: -1 });

// Optional but highly recommended: Compound index for sorting specific statuses by date
SupportTicketSchema.index({ status: 1, createdAt: -1 });

const SupportTicket: Model<ISupportTicket> = mongoose.models.SupportTicket || mongoose.model<ISupportTicket>('SupportTicket', SupportTicketSchema);

export default SupportTicket;
