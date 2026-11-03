#!/usr/bin/env node
/**
 * Cross-platform verification pipeline.
 *
 * Runs the same checks as CI in one shot, with a summary at the end. Written as
 * a Node script (instead of `cmd1 && cmd2 && ...`) because `&&` is not a valid
 * separator in Windows PowerShell 5.1.
 *
 * Usage: npm run verify
 */
import { spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

const steps = [
  { label: 'Type check', args: ['run', 'typecheck'] },
  { label: 'Lint', args: ['run', 'lint'] },
  { label: 'Unit tests', args: ['run', 'test'] },
  { label: 'E2E tests', args: ['run', 'test:e2e'] },
  { label: 'Production build', args: ['run', 'build'] },
];

const results = [];

for (const step of steps) {
  process.stdout.write(`\n\u001b[1m▶ ${step.label}\u001b[0m\n`);

  const startedAt = Date.now();
  const result = spawnSync('npm', step.args, {
    stdio: 'inherit',
    // A shell is required on Windows so that `npm.cmd` resolves.
    shell: isWindows,
  });
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  results.push({ label: step.label, ok: result.status === 0, seconds });

  if (result.status !== 0) {
    console.error(`\n\u001b[31m✖ ${step.label} failed — stopping.\u001b[0m`);
    break;
  }
}

const pad = (value, width) => value.padEnd(width, '.');
const width = Math.max(...results.map((r) => r.label.length)) + 2;

console.log('\n──────────────────────────────');
for (const result of results) {
  const mark = result.ok ? '\u001b[32m✓\u001b[0m' : '\u001b[31m✖\u001b[0m';
  console.log(`${mark} ${pad(result.label, width)} ${result.seconds}s`);
}
console.log('──────────────────────────────');

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  process.exit(1);
}
console.log('\u001b[32mAll checks passed.\u001b[0m');
