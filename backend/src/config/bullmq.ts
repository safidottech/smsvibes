import { Queue } from 'bullmq';
import redisClient from './redis';

/**
 * BullMQ Queue Definitions
 * 
 * All queues utilize the shared redisClient connected to the External Redis Cloud.
 * This ensures that queue data persists across application server reboots,
 * and it minimizes connection overhead by reusing a single robust client.
 */

// 1. OTP Processing Queue
// Engine for provider calls and failover orchestration.
export const otpProcessingQueue = new Queue('otp-processing', {
  connection: redisClient,
});

// 2. Refund Processing Queue
// Handles atomic refunds, wallet restoration, and transaction logging.
export const refundProcessingQueue = new Queue('refund-processing', {
  connection: redisClient,
});

// 3. Email Notifications Queue
// Manages transactional emails via the Resend adapter.
export const emailNotificationsQueue = new Queue('email-notifications', {
  connection: redisClient,
});
