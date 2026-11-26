#!/usr/bin/env node
/** STREAM-007.6: read-only code-quality + isolated API/frontend regression runner. */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requiredFiles = [
  'apps/api/tests/integration/watch-progress.http.test.mjs',
  'apps/web/tests/e2e/discovery-watch-history.spec.ts',
  'apps/api/tests/unit/watch-progress.service.test.ts',
  'apps/web/tests/watch-progress-resume-fix.test.ts',
];
for (const entry of requiredFiles) {
  if (!existsSync(path.join(root, entry))) {
    console.error(`[STREAM-007.6] Missing required file: ${entry}`);
    process.exit(1);
  }
}

const checks = [
  ['Contracts build', ['--filter', '@streamlab/contracts', 'build']],
  [
    'Category + video API regression',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/unit/category-list.service.test.ts',
      'tests/unit/video-category-response.service.test.ts',
    ],
  ],
  [
    'Watch progress unit + HTTP integration',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/unit/watch-progress.service.test.ts',
      'tests/integration/watch-progress.http.test.mjs',
    ],
  ],
  ['Existing public video API', ['--filter', '@streamlab/api', 'test:video:read']],
  [
    'Discovery + creator categories',
    [
      '--filter',
      '@streamlab/web',
      'exec',
      'node',
      '--experimental-strip-types',
      '--test',
      'tests/discovery-search.test.ts',
      'tests/creator-categories.test.ts',
    ],
  ],
  ['Watch history frontend regression', ['--filter', '@streamlab/web', 'test:watch-history']],
  [
    'Resume regression',
    [
      '--filter',
      '@streamlab/web',
      'exec',
      'node',
      '--experimental-strip-types',
      '--test',
      'tests/watch-progress-resume-fix.test.ts',
    ],
  ],
  ['Playback regression', ['--filter', '@streamlab/web', 'test:playback']],
  ['TypeScript', ['typecheck']],
  ['ESLint', ['lint']],
  ['Prettier', ['format:check']],
  ['Frontend build', ['--filter', '@streamlab/web', 'build']],
];
for (const [index, [label, args]] of checks.entries()) {
  console.log(`\n[STREAM-007.6] ${index + 1}/${checks.length} ${label}`);
  const result = spawnSync('pnpm', args, { cwd: root, stdio: 'inherit', env: process.env });
  if (result.error) {
    console.error(`[STREAM-007.6] Cannot start pnpm: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`[STREAM-007.6] FAIL: ${label} (exit ${result.status ?? 'unknown'})`);
    process.exit(result.status || 1);
  }
}
console.log(`\n[STREAM-007.6] PASS: ${checks.length}/${checks.length} offline gates.`);
console.log(
  '[STREAM-007.6] Live browser tests are separate: node scripts/run-stream-007-6.mjs --full',
);
