import { test, mock } from 'node:test';
import assert from 'node:assert';
import mongoose from 'mongoose';
import Wallet from '../src/models/Wallet.js';
import {
  holdBalanceForRequest,
  releaseEscrow,
  refundEscrow,
  cancelWithFee
} from '../src/modules/wallet/wallet.service.js';

/**
 * Approach:
 * 1. Mock mongoose.startSession to return a mock session object that implements withTransaction and endSession.
 * 2. Mock Wallet.findOneAndUpdate to return a query object with an exec() method.
 * 3. Use internal state in the mock to simulate database behavior (e.g., success vs null return).
 * 4. Verify "The Cents Law" (integer math) and atomic logic.
 */

// Global mock for mongoose session
const mockSession = {
  withTransaction: async (fn: Function) => await fn(),
  endSession: async () => {},
};

mock.method(mongoose, 'startSession', async () => mockSession);

test('Wallet Escrow Operations', async (t) => {
  const userId = new mongoose.Types.ObjectId().toString();

  await t.test('holdBalanceForRequest - Success: Deducts available and increases held', async () => {
    const amount = 100; // 100 cents
    const mockWalletDoc = { userId, available: 900, held: 100 };

    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', (filter: any, update: any) => {
      // Basic validation of the atomic query
      assert.strictEqual(filter.userId, userId);
      assert.strictEqual(filter.available.$gte, amount);
      assert.strictEqual(update.$inc.available, -amount);
      assert.strictEqual(update.$inc.held, amount);
      
      return {
        exec: async () => mockWalletDoc
      };
    });

    const result = await holdBalanceForRequest(userId, amount);
    assert.deepStrictEqual(result, mockWalletDoc);
    
    findOneAndUpdateMock.mock.restore();
  });

  await t.test('holdBalanceForRequest - Fail: Throws INSUFFICIENT_BALANCE when funds missing', async () => {
    const amount = 5000;

    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', () => ({
      exec: async () => null // Simulate no document found matching the $gte criteria
    }));

    await assert.rejects(
      holdBalanceForRequest(userId, amount),
      { message: 'INSUFFICIENT_BALANCE' }
    );

    findOneAndUpdateMock.mock.restore();
  });

  await t.test('Concurrent Holds - Only one succeeds if balance is limited', async () => {
    const amount = 600;
    let callCount = 0;

    // Simulate a scenario where the first call succeeds and the second fails
    // (In reality, the second would fail because the first reduced 'available' below the $gte threshold)
    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', () => {
      callCount++;
      const returnValue = callCount === 1 ? { userId, available: 400, held: 600 } : null;
      return {
        exec: async () => returnValue
      };
    });

    const results = await Promise.allSettled([
      holdBalanceForRequest(userId, amount),
      holdBalanceForRequest(userId, amount)
    ]);

    const succeeded = results.filter(r => r.status === 'fulfilled');
    const failed = results.filter(r => r.status === 'rejected');

    assert.strictEqual(succeeded.length, 1, 'One request should succeed');
    assert.strictEqual(failed.length, 1, 'One request should fail');
    assert.strictEqual((failed[0] as PromiseRejectedResult).reason.message, 'INSUFFICIENT_BALANCE');

    findOneAndUpdateMock.mock.restore();
  });

  await t.test('releaseEscrow - Success: Reduces held balance', async () => {
    const amount = 150;
    const mockWalletDoc = { userId, available: 1000, held: 0 };

    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', (filter: any, update: any) => {
      assert.strictEqual(filter.held.$gte, amount);
      assert.strictEqual(update.$inc.held, -amount);
      return {
        exec: async () => mockWalletDoc
      };
    });

    const result = await releaseEscrow(userId, amount);
    assert.deepStrictEqual(result, mockWalletDoc);

    findOneAndUpdateMock.mock.restore();
  });

  await t.test('releaseEscrow - Fail: Throws INSUFFICIENT_HELD_BALANCE', async () => {
    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', () => ({
      exec: async () => null
    }));

    await assert.rejects(
      releaseEscrow(userId, 100),
      { message: 'INSUFFICIENT_HELD_BALANCE' }
    );

    findOneAndUpdateMock.mock.restore();
  });

  await t.test('refundEscrow - Success: Moves held back to available', async () => {
    const amount = 200;
    const mockWalletDoc = { userId, available: 1200, held: 0 };

    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', (filter: any, update: any) => {
      assert.strictEqual(filter.held.$gte, amount);
      assert.strictEqual(update.$inc.available, amount);
      assert.strictEqual(update.$inc.held, -amount);
      return {
        exec: async () => mockWalletDoc
      };
    });

    const result = await refundEscrow(userId, amount);
    assert.deepStrictEqual(result, mockWalletDoc);

    findOneAndUpdateMock.mock.restore();
  });

  await t.test('cancelWithFee - Success: Deducts 12% fee and refunds 88%', async () => {
    const amount = 1000; // 1000 cents
    const expectedFee = 120; // 12% of 1000
    const expectedRefund = 880; // 1000 - 120
    const mockWalletDoc = { userId, available: 1880, held: 0 };

    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', (filter: any, update: any) => {
      assert.strictEqual(filter.held.$gte, amount);
      assert.strictEqual(update.$inc.available, expectedRefund);
      assert.strictEqual(update.$inc.held, -amount);
      return {
        exec: async () => mockWalletDoc
      };
    });

    const { updatedWallet, feeAmount } = await cancelWithFee(userId, amount);
    
    assert.deepStrictEqual(updatedWallet, mockWalletDoc);
    assert.strictEqual(feeAmount, expectedFee, 'Fee should be exactly 120 cents');
    assert.strictEqual(Number.isInteger(feeAmount), true, 'Fee must be an integer');

    findOneAndUpdateMock.mock.restore();
  });

  await t.test('cancelWithFee - Rounding check: 12% of 125 cents', async () => {
    const amount = 125;
    // 125 * 0.12 = 15.0
    const expectedFee = 15; 
    const expectedRefund = 110;

    const findOneAndUpdateMock = mock.method(Wallet, 'findOneAndUpdate', (filter: any, update: any) => {
      assert.strictEqual(update.$inc.available, expectedRefund);
      return {
        exec: async () => ({})
      };
    });

    const { feeAmount } = await cancelWithFee(userId, amount);
    assert.strictEqual(feeAmount, expectedFee);

    findOneAndUpdateMock.mock.restore();
  });
});
