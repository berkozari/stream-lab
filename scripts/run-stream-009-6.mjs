#!/usr/bin/env node
/** Reuse existing real security/worker regression suites. No HTTP load or DB writes. */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['--offline', '--plan'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/run-stream-009-6.mjs --plan | --offline');
  process.exit(2);
}
const gates = [
  ['Contracts build', ['--filter', '@streamlab/contracts', 'build']],
  ['Prisma client generation (no live DB access)', ['db:generate']],
  ['Auth / CSRF / session security', ['--filter', '@streamlab/api', 'test:security']],
  ['Shared Redis limits / proxy spoofing', ['--filter', '@streamlab/api', 'test:hardening']],
  ['Playback and signed HLS', ['--filter', '@streamlab/api', 'test:playback']],
  [
    'Analytics retention and replay resistance',
    ['--filter', '@streamlab/api', 'test:analytics:retention'],
  ],
  [
    'API boundary / playback header / data-quality regression',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/integration/security-boundaries.http.test.ts',
      'tests/integration/playback-security-headers.http.test.ts',
      'tests/unit/stream-008-analytics-data-quality.test.ts',
    ],
  ],
  ['Worker resource admission and lifecycle', ['--filter', '@streamlab/worker', 'test:hardening']],
  ['API + worker observability', ['--filter', '@streamlab/api', 'test:observability']],
  ['Worker metrics and shutdown', ['--filter', '@streamlab/worker', 'test:observability']],
  ['Worker graceful shutdown', ['--filter', '@streamlab/worker', 'test:shutdown']],
];
if (mode === '--plan') {
  gates.forEach(([name], index) => console.log(`[STREAM-009.6] ${index + 1}. ${name}`));
  console.log('[STREAM-009.6] No tests executed, no network traffic generated.');
  process.exit(0);
}
for (let index = 0; index < gates.length; index += 1) {
  const [name, args] = gates[index];
  console.log(`\n[STREAM-009.6] ${index + 1}/${gates.length}: ${name}`);
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: 'test', RATE_LIMIT_STORE: 'memory' },
  });
  if (result.error || result.status !== 0) {
    console.error(
      `[STREAM-009.6] FAIL: ${name} (${result.error?.message ?? `exit ${result.status}`})`,
    );
    process.exit(result.status && result.status > 0 ? result.status : 1);
  }
}
console.log(`\n[STREAM-009.6] PASS: ${gates.length}/${gates.length} offline gates.`);
console.log(
  '[STREAM-009.6] Real PostgreSQL, Redis failover, browser E2E and performance target require separate checks.',
);
