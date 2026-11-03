#!/usr/bin/env node
/**
 * Creates (or updates) the single store-owner account.
 *
 * Usage (from backend/):
 *   npm run seed:admin
 *
 * Required environment variables (in `.env` — never committed):
 *   MONGODB_URI, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD
 * Optional:
 *   SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME, BCRYPT_ROUNDS
 *
 * The script is idempotent: running it again updates the existing account's
 * password hash and role instead of creating a duplicate.
 */
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';

const {
  MONGODB_URI,
  SEED_ADMIN_EMAIL,
  SEED_ADMIN_PASSWORD,
  SEED_ADMIN_FIRST_NAME = 'Store',
  SEED_ADMIN_LAST_NAME = 'Owner',
  BCRYPT_ROUNDS = '12',
} = process.env;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!MONGODB_URI) fail('MONGODB_URI is not set (expected in backend/.env)');
if (!SEED_ADMIN_EMAIL) fail('SEED_ADMIN_EMAIL is not set');
if (!SEED_ADMIN_PASSWORD) fail('SEED_ADMIN_PASSWORD is not set');
if (SEED_ADMIN_PASSWORD.length < 8) fail('SEED_ADMIN_PASSWORD must be at least 8 characters');

const rounds = Number.parseInt(BCRYPT_ROUNDS, 10);
if (!Number.isInteger(rounds) || rounds < 10 || rounds > 15) {
  fail('BCRYPT_ROUNDS must be an integer between 10 and 15');
}

const email = SEED_ADMIN_EMAIL.trim().toLowerCase();

console.log(`Connecting to MongoDB… (admin: ${email})`);

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

try {
  const users = mongoose.connection.collection('users');
  const passwordHash = await bcrypt.hash(SEED_ADMIN_PASSWORD, rounds);
  const now = new Date();
  const existing = await users.findOne({ email });

  if (existing) {
    await users.updateOne(
      { _id: existing._id },
      {
        $set: {
          passwordHash,
          role: 'admin',
          isActive: true,
          firstName: SEED_ADMIN_FIRST_NAME,
          lastName: SEED_ADMIN_LAST_NAME,
          updatedAt: now,
        },
      },
    );
    console.log(`✓ Updated existing account ${email} (role: admin)`);
  } else {
    await users.insertOne({
      email,
      passwordHash,
      firstName: SEED_ADMIN_FIRST_NAME,
      lastName: SEED_ADMIN_LAST_NAME,
      role: 'admin',
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    console.log(`✓ Created admin account ${email}`);
  }

  console.log('  Sign in with POST /api/auth/login using SEED_ADMIN_PASSWORD.');
  console.log('  Remove SEED_ADMIN_PASSWORD from .env once the account exists.');
} finally {
  await mongoose.disconnect();
}
