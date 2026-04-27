import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash?: string | null;
  googleId?: string | null;
  passwordResetToken?: string | null;
  passwordResetExpires?: Date | null;
  role: 'superadmin' | 'admin' | 'user';
  accountType: 'b2c' | 'b2b';
  isEmailVerified: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  suspendedAt?: Date | null;
  bannedAt?: Date | null;
  lastLoginAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name: { 
      type: String, 
      required: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true, 
      lowercase: true 
    },
    passwordHash: { 
      type: String, 
      default: null 
    },
    googleId: { 
      type: String, 
      sparse: true, 
      default: null 
    },
    passwordResetToken: {
      type: String,
      default: null,
      select: false
    },
    passwordResetExpires: {
      type: Date,
      default: null,
      select: false
    },
    role: { 
      type: String, 
      enum: ['superadmin', 'admin', 'user'], 
      required: true 
    },
    accountType: { 
      type: String, 
      enum: ['b2c', 'b2b'], 
      required: true 
    },
    isEmailVerified: { 
      type: Boolean, 
      default: false 
    },
    isSuspended: { 
      type: Boolean, 
      default: false 
    },
    isBanned: { 
      type: Boolean, 
      default: false 
    },
    suspendedAt: { 
      type: Date, 
      default: null 
    },
    bannedAt: { 
      type: Date, 
      default: null 
    },
    lastLoginAt: { 
      type: Date, 
      default: null 
    },
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
  }
);

// Performance & Query Optimization Indexes
// Note: { email: 1 } (unique) and { googleId: 1 } (sparse) are handled by the schema field definitions above.
UserSchema.index({ role: 1 });
UserSchema.index({ accountType: 1 });
UserSchema.index({ isBanned: 1 });
UserSchema.index({ createdAt: -1 }); // For administrative sorting

const User = mongoose.model<IUser>('User', UserSchema);

export default User;
