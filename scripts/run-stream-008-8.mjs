#!/usr/bin/env node
/** Live browser suite. --full is explicitly opt-in: it creates persistent analytics data. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const mode = process.argv[2];
if (!['--public', '--read', '--full'].includes(mode) || process.argv.length !== 3) {
  console.error('Usage: node scripts/run-stream-008-8.mjs --public | --read | --full');
  process.exit(2);
}
const root = process.cwd();
if (
  !existsSync(resolve(root, 'pnpm-workspace.yaml')) ||
  !existsSync(resolve(root, 'playwright.config.ts'))
) {
  console.error('[STREAM-008.8] Run from StreamLab monorepo root (Playwright config missing).');
  process.exit(2);
}
if (mode !== '--public') {
  const required = ['STREAMLAB_E2E_PLAYBACK_EMAIL', 'STREAMLAB_E2E_PLAYBACK_PASSWORD'];
  if (mode === '--full') required.push('STREAMLAB_E2E_ANALYTICS_VIDEO_ID');
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (mode === '--full' && process.env.STREAMLAB_E2E_ANALYTICS_WRITE !== '1') {
    missing.push('STREAMLAB_E2E_ANALYTICS_WRITE=1 (explicit persistent-data consent)');
  }
  if (missing.length) {
    console.error('[STREAM-008.8] Missing E2E configuration:');
    for (const name of missing) console.error(` - ${name}`);
    process.exit(2);
  }
}
const args = [
  'exec',
  'playwright',
  'test',
  'apps/web/tests/e2e/creator-analytics.spec.ts',
  '--config=playwright.config.ts',
  '--workers=1',
];
if (mode === '--public') args.push('--grep', '\\[public\\]');
if (mode === '--read') args.push('--grep', '\\[(?:public|auth)\\]');
console.log(
  `[STREAM-008.8] Running ${mode} browser checks${mode === '--full' ? ' (writes analytics for test video)' : ''}`,
);
const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: process.env });
if (result.error) {
  console.error('[STREAM-008.8] Could not launch pnpm:', result.error.message);
  process.exit(1);
}
if (result.status !== 0) process.exit(result.status || 1);
console.log('[STREAM-008.8] Browser checks PASS.');
