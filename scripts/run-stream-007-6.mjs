#!/usr/bin/env node
/** Run browser QA against an already running local StreamLab environment. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (!['--public', '--full'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/run-stream-007-6.mjs --public | --full');
  process.exit(2);
}
if (mode === '--full') {
  const expected = [
    'STREAMLAB_E2E_PLAYBACK_EMAIL',
    'STREAMLAB_E2E_PLAYBACK_PASSWORD',
    'STREAMLAB_E2E_PLAYBACK_VIDEO_ID',
  ];
  const missing = expected.filter((name) => !process.env[name]?.trim());
  if (process.env.STREAMLAB_E2E_WATCH_WRITE !== '1') {
    missing.push(
      'STREAMLAB_E2E_WATCH_WRITE=1 (explicit consent to change progress for test account)',
    );
  }
  if (missing.length) {
    console.error('[STREAM-007.6] Full E2E cannot run. Missing configuration:');
    for (const item of missing) console.error(`  - ${item}`);
    console.error('See docs/stream-007-integration-e2e.md');
    process.exit(2);
  }
}
const args = [
  'exec',
  'playwright',
  'test',
  'apps/web/tests/e2e/discovery-watch-history.spec.ts',
  '--config=playwright.config.ts',
  '--workers=1',
];
if (mode === '--public') args.push('--grep', '\\[public\\]');
console.log(`[STREAM-007.6] ${mode === '--public' ? 'Public (2)' : 'Full (4)'} browser checks`);
const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
console.log('[STREAM-007.6] E2E PASS.');
