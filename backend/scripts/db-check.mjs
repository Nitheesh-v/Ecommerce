#!/usr/bin/env node
/**
 * Preflight check for `MONGODB_URI` — the answer to the wall of text the driver
 * prints when it cannot reach a cluster.
 *
 * It parses the connection string, reports what it found (masking the password),
 * lists anything that is certainly wrong, then attempts a real connection with a
 * 10-second timeout and explains the failure in terms of the fix.
 *
 * Usage:  npm run db:check            (loads backend/.env itself)
 *         MONGODB_URI=… node scripts/db-check.mjs
 *
 * It imports the built diagnostics module (`dist/`), which is why the npm script
 * builds first — the same functions the API uses at boot, not a second copy that
 * could drift.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const diagnosticsPath = path.join(projectRoot, 'dist', 'database', 'database-diagnostics.js');

const ok = (message) => console.log(`✓ ${message}`);
const bad = (message) => console.log(`✖ ${message}`);
const warn = (message) => console.log(`⚠ ${message}`);
const info = (message) => console.log(`  ${message}`);

if (!existsSync(diagnosticsPath)) {
  bad('dist/database/database-diagnostics.js is missing. Run `npm run build` first.');
  process.exit(1);
}

const { describeDatabaseUri, diagnoseConnectionFailure, maskDatabaseUri } = await import(
  `file://${diagnosticsPath}`
);

// Load backend/.env the way the API does, but only if the variable is not already
// provided — `--env-file=.env` would abort with a confusing ENOENT when the file has
// not been created yet, which is one of the situations this script exists to explain.
const envPath = path.join(projectRoot, '.env');

if (!process.env.MONGODB_URI && existsSync(envPath)) {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // An unreadable .env is reported below as a missing MONGODB_URI.
  }
}

const uri = (process.env.MONGODB_URI ?? '').trim();

console.log('MongoDB preflight');
console.log('─────────────────');

if (!uri) {
  bad('MONGODB_URI is not set.');
  info('backend/.env should contain a line like:');
  info('  MONGODB_URI=mongodb+srv://user:password@cluster0.xxxxx.mongodb.net/ecommerce26?retryWrites=true&w=majority');
  info('Copy it from Atlas → Connect → Drivers → Node.js.');
  process.exit(1);
}

const summary = describeDatabaseUri(uri);

console.log(`  URI       ${maskDatabaseUri(uri)}`);
console.log(`  Kind      ${summary.srv ? 'mongodb+srv (DNS discovery)' : 'mongodb (direct hosts)'}`);
console.log(`  Hosts     ${summary.hosts.join(', ') || '(none)'}`);
console.log(`  Database  ${summary.database ?? '(none — the driver will use "test")'}`);
console.log(`  User      ${summary.username ?? '(none — no credentials)'}`);
console.log(`  Options   ${Object.keys(summary.options).join(', ') || '(none)'}`);
console.log(
  `  Target    ${summary.atlas ? 'Atlas cluster' : summary.local ? 'local MongoDB' : 'MongoDB'}`,
);
console.log('');

for (const problem of summary.problems) {
  bad(problem);
}
for (const warning of summary.warnings) {
  warn(warning);
}

if (!summary.valid) {
  console.log('');
  bad('The URI cannot be parsed, so no connection was attempted. Fix it and re-run.');
  process.exit(1);
}

// Imported lazily so a broken URI never reaches the driver.
const mongoose = (await import('mongoose')).default;

console.log('');
console.log(`Connecting (timeout ${10}s)…`);

try {
  const connection = await mongoose.createConnection(uri, {
    serverSelectionTimeoutMS: 10_000,
    connectTimeoutMS: 10_000,
    // Never write anything during a check.
    autoIndex: false,
  }).asPromise();

  const admin = connection.db.admin();
  const { version } = await admin.serverInfo().catch(() => ({ version: 'unknown' }));
  const ping = await connection.db.command({ ping: 1 }).catch(() => null);

  ok(`Connected to ${connection.host}:${connection.port} (server ${version})`);
  ok(`ping ${ping?.ok === 1 ? 'succeeded' : 'returned an unexpected reply'}`);
  info(`Database "${connection.name}"`);

  await connection.close();
  console.log('');
  ok('MONGODB_URI is usable — start the API with `npm run start:dev`.');
  process.exit(0);
} catch (error) {
  const diagnosis = diagnoseConnectionFailure(error, uri);

  console.log('');
  bad('Connection failed.');
  console.log('');
  console.log(diagnosis.details);
  process.exit(1);
}
