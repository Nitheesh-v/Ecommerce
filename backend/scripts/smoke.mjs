#!/usr/bin/env node
/**
 * HTTP smoke test for a running API — a cross-platform replacement for the
 * `curl -i …` lines in the docs (Windows PowerShell aliases `curl` to
 * Invoke-WebRequest, so `curl -i` behaves differently there).
 *
 * Usage: npm run smoke             (defaults to http://localhost:5000/api)
 *        API_URL=http://localhost:5000/api npm run smoke
 */
const baseUrl = (process.env.API_URL ?? 'http://localhost:5000/api').replace(/\/$/, '');
const timeoutMs = 5_000;

const checks = [
  { path: '/health', expected: 200, label: 'liveness' },
  { path: '/health/ready', expected: 200, label: 'readiness' },
  { path: '/docs', expected: 200, label: 'swagger ui', raw: true },
];

let failures = 0;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: check.raw ? 'text/html' : 'application/json' },
    });
    const ok = response.status === check.expected;
    const body = check.raw ? '' : await response.text();

    console.log(`${ok ? '✓' : '✖'} ${check.label.padEnd(12)} ${response.status} ${url}`);
    if (body) {
      console.log(`  ${body.slice(0, 400)}`);
    }
    if (!ok) {
      failures += 1;
      if (response.status === 503) {
        console.log('  → API is up but the database is not connected (check MONGODB_URI / Atlas IP allow-list).');
      }
    }
  } catch (error) {
    failures += 1;
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`✖ ${check.label.padEnd(12)} unreachable ${url}`);
    console.log(`  ${reason}`);
  }
}

if (failures > 0) {
  console.log(`\n${failures} check(s) failed. Is the API running (npm run start:dev)?`);
  process.exit(1);
}

console.log('\nAll smoke checks passed.');
