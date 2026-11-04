#!/usr/bin/env node
/**
 * Seeds a starter set of categories.
 *
 * Product management (Phase 6) needs categories to exist, but the full category
 * module is the *next* phase — this script is the bridge so products can be
 * created and verified today.
 *
 * Usage (from backend/):
 *   npm run seed:categories
 *
 * Idempotent: upserts by slug, so running it again changes nothing.
 */
import mongoose from 'mongoose';

const { MONGODB_URI } = process.env;

if (!MONGODB_URI) {
  console.error('✖ MONGODB_URI is not set (expected in backend/.env)');
  process.exit(1);
}

const CATEGORIES = [
  { name: 'Audio', slug: 'audio' },
  { name: 'Electronics', slug: 'electronics' },
  { name: 'Accessories', slug: 'accessories' },
  { name: 'Home & Kitchen', slug: 'home-kitchen' },
  { name: 'Fashion', slug: 'fashion' },
  { name: 'Sports & Outdoors', slug: 'sports-outdoors' },
];

console.log('Connecting to MongoDB…');
await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10_000 });

try {
  const categories = mongoose.connection.collection('categories');
  const now = new Date();
  let created = 0;
  let existing = 0;

  for (const category of CATEGORIES) {
    const result = await categories.updateOne(
      { slug: category.slug },
      {
        $setOnInsert: {
          ...category,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true },
    );

    if (result.upsertedCount > 0) {
      created += 1;
    } else {
      existing += 1;
    }
  }

  console.log(
    `✓ Categories ready — ${created} created, ${existing} already present (total ${await categories.countDocuments({})})`,
  );
} finally {
  await mongoose.disconnect();
}
