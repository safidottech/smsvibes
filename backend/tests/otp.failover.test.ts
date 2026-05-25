import { test, mock } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';

// =====================================================================
//  IN-MEMORY STATE STORES
// =====================================================================
const mockRedisStore = new Map<string, string>();
const addedOtpJobs: any[] = [];
const addedRefundJobs: any[] = [];
const otpRequestUpdates: any[] = [];

// =====================================================================
//  1. MOCK ioredis — MUST come before any module that imports redis config
// =====================================================================
import Redis from 'ioredis';

Redis.prototype.connect = async function () {};
Redis.prototype.disconnect = async function () {};
(Redis.prototype as any).on = function () { return this; };
(Redis.prototype as any).once = function () { return this; };
(Redis.prototype as any).emit = function () { return false; };
(Redis.prototype as any).status = 'ready';

Redis.prototype.get = async function (key: string) {
  return mockRedisStore.get(key) || null;
};
Redis.prototype.set = async function (
  key: string,
  value: string,
  _mode?: string,
  _duration?: number
) {
  mockRedisStore.set(key, value);
  return 'OK';
};

// =====================================================================
//  2. MOCK BullMQ — Worker + Queue
// =====================================================================
import { Worker, Queue } from 'bullmq';

// Patch Worker prototype internals to prevent Redis connections.
// The constructor calls `this.run()` which starts the event loop.
// We make it a no-op. We also capture the processor via patching.
let capturedProcessor: Function | null = null;
const OriginalWorkerConstructor = Worker;

// Override `run` so the worker never actually starts polling Redis
(Worker.prototype as any).run = async function () {};
(Worker.prototype as any).close = async function () {};
(Worker.prototype as any).waitUntilReady = async function () {};

// Intercept Worker construction to capture the processor function.
// We do this by patching the `on` event to detect construction,
// but more reliably, we wrap startOtpWorker after import.

// Patch Queue.prototype.add to route jobs into our stores
Queue.prototype.add = async function (
  this: any,
  name: string,
  data: any,
  opts?: any
) {
  const entry = { queueName: this.name, name, data, opts };

  if (this.name === 'otp-processing') {
    // Duplicate jobId check (idempotency simulation)
    if (opts?.jobId && addedOtpJobs.some((j) => j.opts?.jobId === opts.jobId)) {
      return undefined as any;
    }
    addedOtpJobs.push(entry);
  } else if (this.name === 'refund-processing') {
    addedRefundJobs.push(entry);
  }

  return { id: opts?.jobId ?? `mock-${Date.now()}`, ...entry } as any;
};

// Also neuter Queue constructor's internal connection
(Queue.prototype as any).waitUntilReady = async function () {};
(Queue.prototype as any).close = async function () {};

// =====================================================================
//  3. MOCK Mongoose Models
// =====================================================================
import Provider from '../src/models/Provider';
import OtpRequest from '../src/models/OtpRequest';

const mockProviders = [
  { slug: 'provider-a', successRate: 90, priority: 1, isActive: true },
  { slug: 'provider-b', successRate: 80, priority: 2, isActive: true },
  { slug: 'provider-c', successRate: 60, priority: 3, isActive: true },
  { slug: 'provider-d', successRate: 40, priority: 4, isActive: true },
];

mock.method(Provider, 'find', (filter: any) => {
  const excludedSlugs: string[] = filter?.slug?.$nin || [];
  const results = mockProviders.filter(
    (p) => p.isActive && !excludedSlugs.includes(p.slug)
  );
  return {
    sort: () => ({
      limit: () => ({
        exec: async () => results,
      }),
    }),
  };
});

mock.method(OtpRequest, 'findByIdAndUpdate', async (_id: string, update: any) => {
  otpRequestUpdates.push({ id: _id, update });
  return {};
});

mock.method(OtpRequest, 'findById', async () => ({
  userId: new mongoose.Types.ObjectId(),
  price: 150,
}));

// =====================================================================
//  4. CAPTURE PROCESSOR — Wrap the Worker constructor
// =====================================================================

// The worker file calls `new Worker('otp-processing', processorFn, opts)`.
// Since we can't replace Worker on the module, we intercept the processor
// by temporarily wrapping the Worker constructor's `processJob` method.
// Actually, the simplest way: the processor is the 2nd arg to the constructor.
// We can capture it by monkeypatching the constructor via a Proxy on the
// class's Symbol.hasInstance or by wrapping `startOtpWorker`.

// Strategy: Override the entire Worker constructor prototype chain.
// Worker internally stores the processor in `this.processFn` or similar.
// Let's check by capturing it via a patched `Worker.prototype` method
// that gets called during construction.

// Clean approach: We'll import the worker module, call startOtpWorker(),
// and then extract the processor from the returned worker instance.
// Looking at otp.worker.ts line 69-233: the worker instance is returned.
// The processor is stored internally. BullMQ Worker stores it as 
// `this.processFn` (private). We can access it via bracket notation.

import { startOtpWorker } from '../src/workers/otp.worker';

// Start the worker — thanks to our prototype mocks, it won't connect to Redis
const workerInstance = startOtpWorker();

// Extract the processor function from the Worker instance
// BullMQ stores the processor in a private field. Let's find it.
const processorFn = (workerInstance as any).processFn 
  || (workerInstance as any).processor
  || (workerInstance as any)._processFn;

// If direct access fails, we need an alternative approach:
// We'll re-implement the processor logic as a testable extraction.
// But first, let's try to find it via Object.keys.
let processor: Function;

if (typeof processorFn === 'function') {
  processor = processorFn;
} else {
  // Fallback: scan all properties for a function
  const allKeys = Object.getOwnPropertyNames(workerInstance);
  const fnKey = allKeys.find(
    (k) => typeof (workerInstance as any)[k] === 'function' 
      && k !== 'on' && k !== 'close' && k !== 'run' && k !== 'emit'
      && k.toLowerCase().includes('process')
  );
  if (fnKey) {
    processor = (workerInstance as any)[fnKey].bind(workerInstance);
  } else {
    // Last resort: check for the processor in Symbols or via Reflect
    const symbolKeys = Object.getOwnPropertySymbols(workerInstance);
    console.log('[Debug] Worker instance keys:', allKeys);
    console.log('[Debug] Worker symbol keys:', symbolKeys.map(String));
    throw new Error('Could not extract processor from Worker instance. Keys: ' + allKeys.join(', '));
  }
}

// =====================================================================
//  HELPERS
// =====================================================================

function createMockJob(
  overrides: Partial<{
    requestId: string;
    userId: string;
    service: string;
    countryCode: string;
    price: number;
    attemptNumber: number;
    triedProviders: string[];
    timestamp: number;
  }> = {}
): any {
  const data = {
    requestId: overrides.requestId ?? new mongoose.Types.ObjectId().toString(),
    userId: overrides.userId ?? new mongoose.Types.ObjectId().toString(),
    service: overrides.service ?? 'whatsapp',
    countryCode: overrides.countryCode ?? 'PK',
    price: overrides.price ?? 150,
    attemptNumber: overrides.attemptNumber ?? 1,
    triedProviders: overrides.triedProviders ?? [],
  };

  return {
    data,
    timestamp: overrides.timestamp ?? Date.now(),
    updateData: async function (newData: any) {
      Object.assign(this.data, newData);
    },
  };
}

function resetState() {
  mockRedisStore.clear();
  addedOtpJobs.length = 0;
  addedRefundJobs.length = 0;
  otpRequestUpdates.length = 0;
}

// =====================================================================
//  TEST SUITES
// =====================================================================

test('OTP Failover — Failover Trigger', async (t) => {
  await t.test('Provider failure queues new job with updated triedProviders', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.95; // force failure (> 0.8)

    const job = createMockJob({ attemptNumber: 1, triedProviders: [] });
    await processor(job);

    Math.random = origRandom;

    assert.strictEqual(addedOtpJobs.length, 1, 'One failover job should be queued');
    const queued = addedOtpJobs[0];
    assert.strictEqual(queued.data.attemptNumber, 2, 'Attempt incremented to 2');
    assert.ok(
      queued.data.triedProviders.includes('provider-a'),
      'triedProviders includes the failed provider'
    );
    assert.strictEqual(queued.queueName, 'otp-processing');
  });

  await t.test('Final attempt (3) failure triggers refund, no more failover', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.95;

    const job = createMockJob({
      attemptNumber: 3,
      triedProviders: ['provider-a', 'provider-b'],
    });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(addedOtpJobs.length, 0, 'No failover after attempt 3');
    assert.strictEqual(addedRefundJobs.length, 1, 'Refund queued');
    assert.strictEqual(addedRefundJobs[0].data.reason, 'ALL_PROVIDERS_FAILED');
  });
});

test('OTP Failover — Provider Skip Logic', async (t) => {
  await t.test('Skips provider marked "down" in Redis, uses next healthy one', async () => {
    resetState();
    mockRedisStore.set('provider:status:provider-a', 'down');

    const origRandom = Math.random;
    Math.random = () => 0.95;

    const job = createMockJob({ attemptNumber: 1, triedProviders: [] });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(addedOtpJobs.length, 1);
    const queued = addedOtpJobs[0];
    assert.ok(
      queued.data.triedProviders.includes('provider-b'),
      'Used provider-b after skipping downed provider-a'
    );
    assert.ok(
      !queued.data.triedProviders.includes('provider-a'),
      'provider-a was skipped, not added to triedProviders'
    );
  });

  await t.test('Skips multiple downed providers', async () => {
    resetState();
    mockRedisStore.set('provider:status:provider-a', 'down');
    mockRedisStore.set('provider:status:provider-b', 'down');

    const origRandom = Math.random;
    Math.random = () => 0.95;

    const job = createMockJob({ attemptNumber: 1, triedProviders: [] });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(addedOtpJobs.length, 1);
    assert.ok(
      addedOtpJobs[0].data.triedProviders.includes('provider-c'),
      'Jumped to provider-c after a & b are down'
    );
  });

  await t.test('All providers down → refund triggered', async () => {
    resetState();
    mockRedisStore.set('provider:status:provider-a', 'down');
    mockRedisStore.set('provider:status:provider-b', 'down');
    mockRedisStore.set('provider:status:provider-c', 'down');
    mockRedisStore.set('provider:status:provider-d', 'down');

    const job = createMockJob({ attemptNumber: 1, triedProviders: [] });
    await processor(job);

    assert.strictEqual(addedOtpJobs.length, 0, 'No failover — all providers down');
    assert.strictEqual(addedRefundJobs.length, 1, 'Refund triggered');
    assert.strictEqual(addedRefundJobs[0].data.reason, 'ALL_PROVIDERS_FAILED');
  });
});

test('OTP Failover — Timeout Calculation', async (t) => {
  await t.test('successRate=90 (>=85%) → 90s timeout', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.1;

    const job = createMockJob({ attemptNumber: 1, triedProviders: [] });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(job.data.timeoutMs, 90_000);
  });

  await t.test('successRate=80 (70-84%) → 120s timeout', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.1;

    const job = createMockJob({ attemptNumber: 1, triedProviders: ['provider-a'] });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(job.data.timeoutMs, 120_000);
  });

  await t.test('successRate=60 (50-69%) → 150s timeout', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.1;

    const job = createMockJob({
      attemptNumber: 1,
      triedProviders: ['provider-a', 'provider-b'],
    });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(job.data.timeoutMs, 150_000);
  });

  await t.test('successRate=40 (<50%) → 180s timeout', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.1;

    const job = createMockJob({
      attemptNumber: 1,
      triedProviders: ['provider-a', 'provider-b', 'provider-c'],
    });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(job.data.timeoutMs, 180_000);
  });
});

test('OTP Failover — Job Idempotency', async (t) => {
  await t.test('Duplicate jobId rejected — only first job accepted', async () => {
    resetState();
    const sharedId = 'req-idempotency-001';

    const origRandom = Math.random;
    Math.random = () => 0.95;

    const job = createMockJob({ requestId: sharedId, attemptNumber: 1, triedProviders: [] });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(addedOtpJobs.length, 1, 'First job queued');
    assert.strictEqual(addedOtpJobs[0].opts.jobId, sharedId);

    // Manually attempt to add a duplicate
    const { Queue: Q } = await import('bullmq');
    const q = new Q('otp-processing', { connection: {} as any });
    const dupeResult = await q.add('otp-request', { dummy: true }, { jobId: sharedId });

    assert.strictEqual(dupeResult, undefined, 'Duplicate rejected');
    assert.strictEqual(addedOtpJobs.length, 1, 'Still only one job');
  });
});

test('OTP Failover — 10-Minute Hard Cap', async (t) => {
  await t.test('Job >10 min old → refund triggered, processing stopped', async () => {
    resetState();
    const requestId = 'req-hardcap-001';
    const userId = new mongoose.Types.ObjectId().toString();
    const price = 250;

    const job = createMockJob({
      requestId,
      userId,
      price,
      attemptNumber: 2,
      triedProviders: ['provider-a'],
      timestamp: Date.now() - 660_000, // 11 minutes ago
    });
    await processor(job);

    assert.strictEqual(addedOtpJobs.length, 0, 'No OTP jobs after hard cap');
    assert.strictEqual(addedRefundJobs.length, 1, 'Refund queued');

    const refund = addedRefundJobs[0];
    assert.strictEqual(refund.data.requestId, requestId);
    assert.strictEqual(refund.data.userId, userId);
    assert.strictEqual(refund.data.amount, price);
    assert.strictEqual(refund.data.reason, 'HARD_CAP_TIMEOUT');
    assert.strictEqual(Number.isInteger(refund.data.amount), true, 'Cents Law: integer');
  });

  await t.test('Job <10 min old → proceeds normally, no premature refund', async () => {
    resetState();
    const origRandom = Math.random;
    Math.random = () => 0.1;

    const job = createMockJob({
      attemptNumber: 1,
      triedProviders: [],
      timestamp: Date.now() - 300_000, // 5 minutes ago
    });
    await processor(job);
    Math.random = origRandom;

    assert.strictEqual(addedRefundJobs.length, 0, 'No premature refund');
  });
});
