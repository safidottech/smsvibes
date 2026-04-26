import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import User from '../../models/User';
import Wallet from '../../models/Wallet';

export interface OAuthCompleteData {
  googleId: string;
  email: string;
  name: string;
  accountType: 'b2c' | 'b2b';
}

export interface OAuthCompleteResponse {
  success: boolean;
  user: any;
  token: string;
}

export const completeOAuthRegistration = async (
  data: OAuthCompleteData
): Promise<OAuthCompleteResponse> => {
  const { googleId, email, name, accountType } = data;

  if (!googleId || !email || !name || !accountType) {
    throw new Error('MISSING_REQUIRED_FIELDS');
  }

  if (accountType !== 'b2c' && accountType !== 'b2b') {
    throw new Error('INVALID_ACCOUNT_TYPE');
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1. Check if user exists by googleId or email
    let user = await User.findOne({
      $or: [{ googleId }, { email }],
    }).session(session);

    if (!user) {
      // 2. Create new User if not exists
      const [newUser] = await User.create(
        [
          {
            name,
            email,
            passwordHash: null,
            googleId,
            role: 'user',
            accountType,
            isEmailVerified: true,
          },
        ],
        { session }
      );

      // 3. Create associated Wallet (Cents Law: values in integer cents)
      await Wallet.create(
        [
          {
            userId: newUser._id,
            available: 0,
            held: 0,
          },
        ],
        { session }
      );

      user = newUser;
    } else {
      // If user exists but googleId is not set, we can update it
      if (!user.googleId) {
        user.googleId = googleId;
        // Optionally update isEmailVerified since Google has verified it
        if (!user.isEmailVerified) {
          user.isEmailVerified = true;
        }
        await user.save({ session });
      }
    }

    await session.commitTransaction();

    // 4. Generate JWT
    const jwtSecret = process.env.JWT_SECRET || 'fallback_secret_please_change_in_production';
    const token = jwt.sign(
      {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        accountType: user.accountType,
      },
      jwtSecret,
      { expiresIn: '7d' } // 7 days expiration as a typical default
    );

    return {
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        accountType: user.accountType,
        isEmailVerified: user.isEmailVerified,
      },
      token,
    };
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    await session.endSession();
  }
};
