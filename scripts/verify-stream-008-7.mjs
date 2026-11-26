#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const required = [
  'apps/api/package.json',
  'apps/api/src/lib/playback-analytics-rules.ts',
  'apps/api/src/lib/creator-analytics-metrics.ts',
  'apps/api/src/lib/creator-video-analytics.ts',
  'apps/api/tests/unit/stream-008-analytics-data-quality.test.ts',
  'apps/api/tests/unit/stream-008-creator-metrics-quality.test.ts',
  'pnpm-workspace.yaml',
];
const missing = required.filter((file) => !existsSync(resolve(root, file)));
if (missing.length) {
  console.error('[STREAM-008.7] Missing required files:', missing.join(', '));
  process.exit(1);
}
if (process.argv.includes('--check')) {
  console.log('[STREAM-008.7] CHECK PASS: audit files present; no tests executed.');
  process.exit(0);
}
if (process.argv.some((arg) => arg.startsWith('--'))) {
  console.error('Usage: node scripts/verify-stream-008-7.mjs [--check]');
  process.exit(2);
}
const gates = [
  ['Contracts build', ['--filter', '@streamlab/contracts', 'build']],
  [
    'Analytics ingestion regression',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/unit/playback-analytics-rules.test.ts',
      'tests/unit/playback-analytics.service.test.ts',
      'tests/unit/stream-008-analytics-data-quality.test.ts',
    ],
  ],
  [
    'Creator metrics and authorization regression',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/unit/creator-analytics-metrics.test.ts',
      'tests/unit/creator-analytics.service.test.ts',
      'tests/unit/creator-analytics.controller.test.ts',
      'tests/unit/creator-video-analytics-rules.test.ts',
      'tests/unit/creator-video-analytics.service.test.ts',
      'tests/unit/creator-video-analytics.controller.test.ts',
      'tests/unit/stream-008-creator-metrics-quality.test.ts',
    ],
  ],
  ['Playback regression', ['--filter', '@streamlab/web', 'test:playback']],
  ['Watch History regression', ['--filter', '@streamlab/web', 'test:watch-history']],
  ['Workspace TypeScript', ['typecheck']],
  ['ESLint', ['lint']],
  ['Prettier', ['format:check']],
  ['Frontend production build', ['--filter', '@streamlab/web', 'build']],
];
for (let index = 0; index < gates.length; index += 1) {
  const [name, args] = gates[index];
  console.log(`\n[STREAM-008.7] ${index + 1}/${gates.length}: ${name}`);
  const result = spawnSync('pnpm', args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    console.error(
      `[STREAM-008.7] FAIL: ${name} (${result.error?.message ?? `exit ${result.status ?? 'unknown'}`})`,
    );
    process.exit(result.status && result.status > 0 ? result.status : 1);
  }
}
console.log(`\n[STREAM-008.7] PASS: ${gates.length}/${gates.length} offline gates.`);
console.log(
  '[STREAM-008.7] Database query plans and real-browser analytics remain separate manual checks.',
);
