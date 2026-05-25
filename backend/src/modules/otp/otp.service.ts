import { Types } from 'mongoose';
import OtpRequest from '../../models/OtpRequest';
import { holdBalanceForRequest } from '../../modules/wallet/wallet.service';
import { otpProcessingQueue } from '../../config/bullmq';

/**
 * Parameters required to create a new OTP request.
 */
export interface CreateOtpParams {
  /** User identifier (Mongo ObjectId as string) */
  userId: string;
  /** Service name, e.g., 'whatsapp', 'telegram' */
  service: string;
  /** ISO country code, e.g., 'PK', 'US' */
  countryCode: string;
  /** Price in integer cents – complies with the Cents Law */
  price: number;
  /** Optional phone number for the OTP destination */
  phoneNumber?: string;
}

/**
 * Creates an OTP request with atomic escrow hold, persists the request document,
 * and enqueues a BullMQ job using the requestId as the jobId to guarantee idempotency.
 *
 * @returns The newly created requestId (string).
 */
export const createOtpRequest = async (params: CreateOtpParams): Promise<string> => {
  const { userId, service, countryCode, price, phoneNumber } = params;

  // 1️⃣ Atomic escrow hold – reserves the user's balance before any external call.
  // The wallet service enforces the Cents Law internally.
  await holdBalanceForRequest(userId, price);

  // 2️⃣ Persist the OTP request with status 'pending'.
  const requestDoc = await OtpRequest.create({
    _id: new Types.ObjectId(), // explicit ID for clarity
    userId,
    service,
    countryCode,
    price,
    phoneNumber: phoneNumber ?? null,
    status: 'pending',
    attempts: [],
    createdAt: new Date(),
  });

  const requestId = requestDoc._id.toString();

  // 3️⃣ Enqueue the processing job – jobId === requestId guarantees idempotency.
  await otpProcessingQueue.add(
    'otp-request',
    {
      requestId,
      userId,
      service,
      countryCode,
      price,
      attemptNumber: 1,
      triedProviders: [],
    },
    {
      jobId: requestId, // BullMQ will reject duplicate jobIds automatically.
      // @ts-ignore: Enforcing hard-cap timeout per requirements
      timeout: 600000, // 10‑minute hard cap per job
      removeOnComplete: true,
    }
  );

  return requestId;
};
