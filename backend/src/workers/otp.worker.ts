import { Worker, Job } from 'bullmq';
import redisClient from '../config/redis';
import Provider from '../models/Provider';
import OtpRequest from '../models/OtpRequest';
import { otpProcessingQueue, refundProcessingQueue } from '../config/bullmq';
import { OtpAdapterFactory } from '../adapters/otp/OtpAdapterFactory';

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

/**
 * Socket Emission Helper
 * 
 * TODO: Integrate with actual Socket.io server instance.
 * For now, this serves as a placeholder for the required architectural events.
 */
const emitSocketEvent = (room: string, event: string, payload: any) => {
  console.log(`[Socket] Room: ${room} | Event: ${event} | Payload:`, payload);
  // Implementation note: In a multi-node setup, this would typically use redisClient.publish
  // to a socket-emitter channel that the main API process listens to.
};

/**
 * handleFinalFailure
 * Marks the request as failed and triggers the refund worker.
 */
async function handleFinalFailure(requestId: string) {
  console.error(`[Worker] Request ${requestId}: All attempts failed. Triggering refund.`);

  // 1. Update OtpRequest status to 'failed'
  await OtpRequest.findByIdAndUpdate(requestId, {
    status: 'failed',
    resolvedAt: new Date()
  });

  // 2. Trigger Refund Worker
  await refundProcessingQueue.add('process-refund', {
    requestId,
    reason: 'ALL_PROVIDERS_FAILED'
  }, {
    removeOnComplete: true
  });

  // 3. Emit failure socket event
  emitSocketEvent(`request:${requestId}`, 'otp:failed', {
    requestId,
    message: 'All provider attempts failed. A refund has been initiated.'
  });
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
      const candidateProviders = await Provider.find({
        isActive: true,
        slug: { $nin: triedProviders },
      })
        .sort({ successRate: -1, priority: 1 })
        .limit(10)
        .exec();

      let provider = null;
      for (const p of candidateProviders) {
        // Check if provider is currently marked as 'down' in Redis (30s TTL)
        const isDown = await redisClient.get(`provider:status:${p.slug}`);
        if (!isDown) {
          provider = p;
          break;
        }
      }

      if (!provider) {
        console.warn(`[Worker] Request ${requestId}: No active or healthy providers available for attempt ${attemptNumber}.`);
        await handleFinalFailure(requestId);
        return;
      }

      // 2. Hybrid Dynamic Timeout Calculation
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

      console.log(`[Worker] Request ${requestId}: Attempt ${attemptNumber} using ${provider.slug} (Timeout: ${timeout}s)`);
      
      // Update job data with calculated timeout for record-keeping
      await job.updateData({
        ...job.data,
        timeoutMs: timeout * 1000
      });

      // 3. Provider Call Simulation (Task S4.7 Requirement)
      try {
        // Architectural Intent: Use OtpAdapterFactory to interact with the provider.
        // For this task, we skip the real call and simulate results.
        // const adapter = OtpAdapterFactory.create(provider);

        const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5s delay
        await new Promise(resolve => setTimeout(resolve, delay));

        const isSuccessful = Math.random() < 0.8; // 80% success rate

        if (isSuccessful) {
          // --- SUCCESS PATH ---
          const simulatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
          
          // Update OtpRequest document
          await OtpRequest.findByIdAndUpdate(requestId, {
            status: 'received',
            otp: simulatedOtp,
            resolvedAt: new Date(),
            $push: {
              attempts: {
                provider: provider.slug,
                startedAt: new Date(Date.now() - delay),
                result: 'success',
                deliveredAt: new Date(),
              }
            }
          });

          // Emit success socket event
          emitSocketEvent(`request:${requestId}`, 'otp:received', {
            requestId,
            otp: simulatedOtp,
            message: 'OTP received successfully'
          });

          console.log(`[Worker] Request ${requestId}: Success via ${provider.slug}`);
          return { success: true, provider: provider.slug };
        } else {
          // --- SIMULATED FAILURE ---
          throw new Error('PROVIDER_ERROR');
        }
      } catch (error) {
        // --- FAILURE / FAILOVER PATH ---
        console.error(`[Worker] Request ${requestId}: Attempt ${attemptNumber} failed via ${provider.slug}`);

        // Mark provider as 'down' in Redis (30s TTL)
        await redisClient.set(`provider:status:${provider.slug}`, 'down', 'EX', 30);

        // Record the failed attempt in the database
        await OtpRequest.findByIdAndUpdate(requestId, {
          $push: {
            attempts: {
              provider: provider.slug,
              startedAt: new Date(),
              result: 'error'
            }
          }
        });

        if (attemptNumber < 3) {
          // Queue a new job for the next provider (Chained Jobs pattern)
          await otpProcessingQueue.add('otp-request', {
            ...job.data,
            attemptNumber: attemptNumber + 1,
            triedProviders: [...triedProviders, provider.slug]
          }, {
            jobId: requestId, // Explicit dedup
            removeOnComplete: true
          });

          // Emit failover socket event
          emitSocketEvent(`request:${requestId}`, 'otp:failover', {
            requestId,
            attemptNumber: attemptNumber + 1,
            message: `Attempt ${attemptNumber} failed. Switching provider...`
          });
        } else {
          // Final attempt failed
          await handleFinalFailure(requestId);
        }
      }
    },
    {
      connection: redisClient,
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
