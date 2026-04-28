/**
 * @file backend/scripts/seedSuperAdmin.ts
 * @description Bootstrap script — Seeds the initial SuperAdmin account.
 *
 * Atomicity Strategy:
 * ──────────────────
 * MongoDB multi-document transactions require a replica set. To remain
 * compatible with standalone development instances while still guaranteeing
 * consistency, we use a *manual compensating-write* pattern:
 *
 *   1. Check for an existing superadmin → abort early if found.
 *   2. Create the User document (fails fast if the email already exists via the unique index).
 *   3. Create the Wallet document (linked to the new userId).
 *   4. Create the AuditLog document (insert-only, immutable by schema design).
 *
 * If step 3 or 4 throws after the User has been saved, the catch block
 * attempts to delete the orphaned User document before re-throwing, leaving
 * the database in its original state.
 *
 * If a true replica-set environment is available, this script will
 * automatically use a MongoDB session / transaction (detected at runtime).
 *
 * Run command (from backend/ root):
 *   npx ts-node --project tsconfig.scripts.json scripts/seedSuperAdmin.ts
 */

import mongoose, { ClientSession } from 'mongoose';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import path from 'path';

// ─── Load .env relative to this script's location ───────────────────────────
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ─── Models ─────────────────────────────────────────────────────────────────
import User  from '../src/models/User';
import Wallet from '../src/models/Wallet';
import AuditLog from '../src/models/AuditLog';

// ─── Constants ───────────────────────────────────────────────────────────────
const BCRYPT_SALT_ROUNDS = 12;
const SEED_IP            = '127.0.0.1'; // Script-origin placeholder IP

// ─── Environment Variable Validation ─────────────────────────────────────────
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(`\n❌  [seedSuperAdmin] Fatal: Environment variable "${key}" is missing or empty.`);
    console.error(`    Ensure it is set in backend/.env before running this script.\n`);
    process.exit(1);
  }
  return value.trim();
}

// ─── IIFE ─────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🌱  [seedSuperAdmin] Starting SuperAdmin seed...\n');

  // 1. Validate required environment variables up front
  const mongoUri          = getRequiredEnv('MONGODB_URI');
  const superadminEmail   = getRequiredEnv('SUPERADMIN_EMAIL').toLowerCase();
  const superadminPassword = getRequiredEnv('SUPERADMIN_PASSWORD');

  // 2. Connect to MongoDB
  try {
    await mongoose.connect(mongoUri);
    console.log(`✅  [seedSuperAdmin] Connected to MongoDB.`);
  } catch (err) {
    console.error('❌  [seedSuperAdmin] MongoDB connection failed:', err);
    process.exit(1);
  }

  // 3. Detect replica set capability for optional transaction support
  let session: ClientSession | null = null;
  let useTransaction = false;

  try {
    session = await mongoose.connection.startSession();
    session.startTransaction();
    useTransaction = true;
    console.log('🔒  [seedSuperAdmin] Replica set detected — using MongoDB transaction.');
  } catch {
    // Standalone instance — fall back to compensating-write pattern
    session = null;
    useTransaction = false;
    console.log('ℹ️   [seedSuperAdmin] Standalone MongoDB — using compensating-write pattern.');
  }

  // Helper to build the session options object (only when a session is active)
  const sessionOpts = session ? { session } : {};

  try {
    // 4. Existence check — prevent duplicate seeding
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' }, null, sessionOpts);
    if (existingSuperAdmin) {
      console.log('⚠️   [seedSuperAdmin] A SuperAdmin account already exists.');
      console.log(`    Email: ${existingSuperAdmin.email}`);
      console.log('    Seed aborted — no changes were made.\n');
      if (useTransaction && session) await session.abortTransaction();
      return; // Exit cleanly; finally block will disconnect
    }

    // 5. Hash the password (12 salt rounds — enforced by security standard)
    console.log('🔐  [seedSuperAdmin] Hashing password...');
    const passwordHash = await bcrypt.hash(superadminPassword, BCRYPT_SALT_ROUNDS);

    // 6. Create the SuperAdmin User document
    console.log('👤  [seedSuperAdmin] Creating SuperAdmin User document...');
    const [superAdminUser] = await User.create(
      [
        {
          name:            'Super Admin',
          email:           superadminEmail,
          passwordHash,
          role:            'superadmin',
          accountType:     'b2b',
          isEmailVerified: true,
          isSuspended:     false,
          isBanned:        false,
        },
      ],
      sessionOpts
    );

    // 7. Create the associated Wallet document (Cents Law: available and held are integer cents)
    console.log('💳  [seedSuperAdmin] Creating SuperAdmin Wallet document...');
    try {
      await Wallet.create(
        [
          {
            userId:    superAdminUser._id,
            available: 0,  // ← Integer cents (Cents Law enforced by schema setter)
            held:      0,  // ← Integer cents
          },
        ],
        sessionOpts
      );
    } catch (walletErr) {
      // Compensating write — remove the orphaned User if not in a transaction
      if (!useTransaction) {
        console.warn('⚠️   [seedSuperAdmin] Wallet creation failed. Rolling back User document...');
        await User.deleteOne({ _id: superAdminUser._id });
      }
      throw walletErr;
    }

    // 8. Silent Audit — record the creation event in AuditLogs
    // NOTE: 'ADMIN_CREATED' is the intended actionType per the platform spec.
    // The AuditLog schema currently enumerates 17 action types that do not yet
    // include 'ADMIN_CREATED'. We bypass the TS enum constraint via a type cast
    // here in the seed script only. Add 'ADMIN_CREATED' to AuditActionTypes in
    // AuditLog.ts when the full audit-trail spec is finalised.
    console.log('📋  [seedSuperAdmin] Writing AuditLog entry...');
    try {
      await (AuditLog as any).create(
        [
          {
            adminId:    superAdminUser._id,
            adminEmail: superAdminUser.email,
            actionType: 'ADMIN_CREATED', // Cast: see NOTE above
            targetId:   superAdminUser._id,
            targetEmail: superAdminUser.email,
            detail:     'SuperAdmin account bootstrapped via seedSuperAdmin script during deployment.',
            ipAddress:  SEED_IP,
          },
        ],
        sessionOpts
      );
    } catch (auditErr) {
      // Compensating write — remove User + Wallet if not in a transaction
      if (!useTransaction) {
        console.warn('⚠️   [seedSuperAdmin] AuditLog creation failed. Rolling back User and Wallet...');
        await Wallet.deleteOne({ userId: superAdminUser._id });
        await User.deleteOne({ _id: superAdminUser._id });
      }
      throw auditErr;
    }

    // 9. Commit transaction (replica set path)
    if (useTransaction && session) {
      await session.commitTransaction();
      console.log('🔒  [seedSuperAdmin] Transaction committed.');
    }

    // 10. Success
    console.log('\n✅  [seedSuperAdmin] SuperAdmin seeded successfully!');
    console.log(`    Email : ${superAdminUser.email}`);
    console.log(`    Role  : ${superAdminUser.role}`);
    console.log(`    Type  : ${superAdminUser.accountType}`);
    console.log(`    ID    : ${superAdminUser._id}\n`);

  } catch (err) {
    if (useTransaction && session) {
      await session.abortTransaction();
      console.warn('🔒  [seedSuperAdmin] Transaction aborted.');
    }
    console.error('\n❌  [seedSuperAdmin] Seed failed:', err);
    process.exit(1);

  } finally {
    if (session) session.endSession();
    await mongoose.disconnect();
    console.log('🔌  [seedSuperAdmin] Disconnected from MongoDB. Done.\n');
  }
})();
