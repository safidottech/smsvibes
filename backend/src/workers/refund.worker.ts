import { Worker, Job } from 'bullmq';
import redisClient from '../config/redis';
import OtpRequest from '../models/OtpRequest';
import { refundEscrow } from '../modules/wallet/wallet.service';
import { recordTransaction } from '../modules/wallet/transaction.service';

/**
 * Refund Processing Job Data Contract
 */
interface RefundProcessingData {
  requestId: string;
  userId?: string;
  amount?: number;
  reason?: string;
  statusOverride?: 'failed' | 'cancelled';
}

/**
 * Socket Emission Helper
 */
const emitSocketEvent = (room: string, event: string, payload: any) => {
  console.log(`[Socket] Room: ${room} | Event: ${event} | Payload:`, payload);
};

export const startRefundWorker = () => {
  const worker = new Worker(
    'refund-processing',
    async (job: Job<RefundProcessingData>) => {
      const { requestId, userId: jobUserId, amount: jobAmount, reason = 'UNKNOWN', statusOverride } = job.data;

      console.log(`[Refund Worker] Processing refund for request ${requestId} (Reason: ${reason})`);

      // 1. Retrieve the OtpRequest document if needed
      const otpRequest = await OtpRequest.findById(requestId);
      if (!otpRequest) {
        throw new Error(`OTP Request ${requestId} not found.`);
      }

      // Determine the target state (default is 'failed')
      const targetStatus: 'failed' | 'cancelled' = statusOverride || 
        (reason.includes('CANCEL') ? 'cancelled' : 'failed');

      // Resolve final target variables adhering to strict types
      const finalUserId = jobUserId || otpRequest.userId.toString();
      const finalAmount = typeof jobAmount === 'number' ? jobAmount : otpRequest.price;

      // 2. Perform Atomic Refund Escrow
      console.log(`[Refund Worker] Restoring ${finalAmount} cents to user ${finalUserId} from held balance`);
      await refundEscrow(finalUserId, finalAmount);

      // 3. Record Immutable Transaction Ledger Entry (The Cents Law Compliant)
      console.log(`[Refund Worker] Logging refund transaction in ledger`);
      await recordTransaction({
        userId: finalUserId,
        type: 'refund',
        amount: finalAmount,
        requestId: requestId,
        note: `Refund for OTP Request ${requestId} due to ${reason}`,
      });

      // 4. Update the Database Document Status
      otpRequest.status = targetStatus;
      otpRequest.resolvedAt = new Date();
      await otpRequest.save();

      // 5. Emit Socket Notification for Frontend Real-time Sync
      const eventName = targetStatus === 'cancelled' ? 'otp:cancelled' : 'otp:failed';
      emitSocketEvent(`request:${requestId}`, eventName, {
        requestId,
        status: targetStatus,
        message: `Request was ${targetStatus}. Fully refunded ${finalAmount} cents.`,
      });

      console.log(`[Refund Worker] Request ${requestId} fully processed and refunded successfully.`);
      return { success: true, requestId, refundedAmount: finalAmount };
    },
    {
      connection: redisClient,
      lockDuration: 600000,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Refund Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Refund Worker] Fatal Worker Error:', err);
  });

  console.log('🚀 Refund Processing Worker started and listening to "refund-processing" queue.');
  
  return worker;
};
