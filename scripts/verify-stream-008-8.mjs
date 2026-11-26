#!/usr/bin/env node
/** Tests only: reuse STREAM-008.7 regression and add HTTP + analytics frontend checks. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  'pnpm-workspace.yaml',
  'scripts/verify-stream-008-7.mjs',
  'apps/api/tests/integration/creator-analytics.http.test.mjs',
  'apps/web/tests/e2e/creator-analytics.spec.ts',
  'scripts/run-stream-008-8.mjs',
];
const missing = required.filter((entry) => !existsSync(resolve(root, entry)));
if (missing.length) {
  console.error('[STREAM-008.8] Missing files:', missing.join(', '));
  process.exit(1);
}
if (process.argv.includes('--check') && process.argv.length === 3) {
  console.log('[STREAM-008.8] CHECK PASS: required files are present.');
  process.exit(0);
}
if (process.argv.length !== 2) {
  console.error('Usage: node scripts/verify-stream-008-8.mjs [--check]');
  process.exit(2);
}
const gates = [
  ['Existing STREAM-008.7 regression (9 gates)', 'node', ['scripts/verify-stream-008-7.mjs']],
  [
    'Creator analytics HTTP integration',
    'pnpm',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/integration/creator-analytics.http.test.mjs',
    ],
  ],
  [
    'Frontend analytics contracts',
    'pnpm',
    [
      '--filter',
      '@streamlab/web',
      'exec',
      'node',
      '--experimental-strip-types',
      '--test',
      'tests/creator-analytics-client.test.ts',
      'tests/creator-video-analytics-client.test.ts',
    ],
  ],
  [
    'Playback event tracker + queue',
    'pnpm',
    [
      '--filter',
      '@streamlab/web',
      'exec',
      'node',
      '--experimental-strip-types',
      '--test',
      'tests/playback-analytics-tracker.test.ts',
      'tests/playback-analytics-queue.test.ts',
    ],
  ],
  ['Git diff whitespace validation', 'git', ['diff', '--check']],
];
for (const [index, [name, command, args]] of gates.entries()) {
  console.log(`\n[STREAM-008.8] ${index + 1}/${gates.length}: ${name}`);
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) {
    console.error(
      `[STREAM-008.8] FAIL: ${name} (${result.error?.message ?? `exit ${result.status ?? 'unknown'}`})`,
    );
    process.exit(result.status && result.status > 0 ? result.status : 1);
  }
}
console.log(
  `\n[STREAM-008.8] PASS: ${gates.length}/${gates.length} offline gates (including the existing 9 checks).`,
);
console.log(
  '[STREAM-008.8] Live browser E2E: node scripts/run-stream-008-8.mjs --public|--read|--full',
);
