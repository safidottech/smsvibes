import { Worker, Job } from 'bullmq';
import redisClient from '../config/redis';
import Provider from '../models/Provider';

/**
 * OTP Processing Worker
 * 
 * Orchestrates provider selection and failover logic for OTP requests.
 * Listens to the 'otp-processing' queue and selects the best provider
 * based on successRate and priority metrics.
 * 
 * Resilience Standard: 10-minute (600,000ms) hard cap per job.
 */

interface OtpProcessingData {
  requestId: string;
  userId: string;
  service: string;
  countryCode: string;
  price: number;
  attemptNumber: number;
  triedProviders: string[];
  timeoutMs?: number;
}

export const startOtpWorker = () => {
  const worker = new Worker(
    'otp-processing',
    async (job: Job<OtpProcessingData>) => {
      const { 
        requestId, 
        userId, 
        service, 
        countryCode, 
        price, 
        attemptNumber, 
        triedProviders = [] 
      } = job.data;

      // 1. Provider Selection Logic
      // Query for active providers, excluding those already tried in previous attempts.
      // Primary Sort: successRate (DESC) - Prioritize performance.
      // Secondary Sort: priority (ASC) - Tie-breaker for load balancing/cost.
      const provider = await Provider.findOne({
        isActive: true,
        slug: { $nin: triedProviders },
      })
        .sort({ successRate: -1, priority: 1 })
        .exec();

      if (!provider) {
        console.warn(`[Worker] Request ${requestId}: No active providers available for attempt ${attemptNumber}.`);
        // Failover/Refund logic will be handled in Task S4.7
        return;
      }

      // 2. Hybrid Dynamic Timeout Calculation
      // Based on Section 5.3 of the Technical Architecture:
      // | Success Rate | Timeout |
      // | ------------ | ------- |
      // | >= 85%       | 90s     |
      // | 70% - 84%    | 120s    |
      // | 50% - 69%    | 150s    |
      // | < 50%        | 180s    |
      
      const successRate = provider.successRate || 0;
      let timeout: number;

      if (successRate >= 85) {
        timeout = 90;
      } else if (successRate >= 70) {
        timeout = 120;
      } else if (successRate >= 50) {
        timeout = 150;
      } else {
        timeout = 180;
      }

      // Log the selection and assigned timeout as required for S4.6
      console.log(`[Worker] Request ${requestId}: Attempt ${attemptNumber} using ${provider.slug} (Timeout: ${timeout}s)`);
      
      // Store metrics for next step (Task S4.7)
      // Note: userId and price are available in local scope for adapter billing logic.

      // 3. Assign timeout for use in adapter calls (Task S4.7)
      // We store it in the job data so it's accessible in the next phase and persists across retries.
      await job.updateData({
        ...job.data,
        timeoutMs: timeout * 1000
      });

    },
    {
      connection: redisClient,
      // Hard Cap: 10-minute (600,000ms) lock duration to prevent stalled jobs from hanging indefinitely.
      lockDuration: 600000,
    }
  );

  worker.on('failed', (job, err) => {
    console.error(`[Worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Worker] Fatal Worker Error:', err);
  });

  console.log('🚀 OTP Processing Worker started and listening to "otp-processing" queue.');
  
  return worker;
};
