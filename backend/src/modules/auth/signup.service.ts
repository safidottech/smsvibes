import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import User from '../../models/User';
import Wallet from '../../models/Wallet';
import { emailNotificationsQueue } from '../../config/bullmq';

export interface SignupData {
  name: string;
  email: string;
  password: string;
  accountType: 'b2c' | 'b2b';
}

export interface SignupResponse {
  success: boolean;
  message: string;
}

export const signupUser = async (data: SignupData): Promise<SignupResponse> => {
  const { name, email, password, accountType } = data;

  // 1. Validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new Error('INVALID_EMAIL');
  }

  if (!password || password.length < 8) {
    throw new Error('INVALID_PASSWORD');
  }

  if (accountType !== 'b2c' && accountType !== 'b2b') {
    throw new Error('INVALID_ACCOUNT_TYPE');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 2. Check for existing user
    const existingUser = await User.findOne({ email }).session(session);
    if (existingUser) {
      throw new Error('EMAIL_ALREADY_EXISTS');
    }

    // 3. Hash password (12 salt rounds)
    const passwordHash = await bcrypt.hash(password, 12);

    // 4. Create User
    const [user] = await User.create(
      [
        {
          name,
          email,
          passwordHash,
          accountType,
          role: 'user',
          isEmailVerified: false,
        },
      ],
      { session }
    );

    // 5. Create Wallet (Cents Law: initialized with integer 0)
    await Wallet.create(
      [
        {
          userId: user._id,
          available: 0,
          held: 0,
        },
      ],
      { session }
    );

    // Commit transaction before queuing email
    // This ensures that the user/wallet documents exist in the DB
    // when the worker attempts to process the email job.
    await session.commitTransaction();

    // 6. Queue Email Job
    await emailNotificationsQueue.add('send-verification', {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
    });

    // 7. Return success response
    return { success: true, message: 'Verification email sent' };
  } catch (error) {
    // Abort transaction in case of an error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    
    // Bubble up the specific error or any other unexpected errors
    throw error;
  } finally {
    // Ensure session is always ended
    await session.endSession();
  }
};
