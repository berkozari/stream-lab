#!/usr/bin/env node
/** STREAM-007.8 final regression & Git safety review. Never changes repo or database itself. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  auditTrackedPaths,
  missingFullE2eConfig,
  missingRequiredFiles,
} from './lib/stream-007-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const allowed = new Set(['--inspect-only', '--e2e', '--help']);
function say(message) {
  console.log(`[STREAM-007.8] ${message}`);
}
function fail(message, code = 1) {
  console.error(`[STREAM-007.8] FAIL: ${message}`);
  process.exit(code);
}
if (args.some((arg) => !allowed.has(arg)) || new Set(args).size !== args.length) {
  fail('Usage: node scripts/verify-stream-007-8.mjs [--inspect-only | --e2e | --help]', 2);
}
if (args.includes('--help')) {
  say('Usage: node scripts/verify-stream-007-8.mjs [--inspect-only | --e2e]');
  say(
    'Default: Git security audit and offline regression. --e2e additionally runs writable 4-test Playwright suite.',
  );
  say('--inspect-only: check file presence and Git state, without running pnpm or browser tests.');
  process.exit(0);
}
if (args.includes('--inspect-only') && args.includes('--e2e'))
  fail('Options --inspect-only and --e2e are mutually exclusive.', 2);
const inspectOnly = args.includes('--inspect-only');
const withE2e = args.includes('--e2e');

// Validate opt-in and credentials before initiating any possibly slow tests.
if (withE2e) {
  const missing = missingFullE2eConfig(process.env);
  if (missing.length) {
    for (const item of missing) console.error(`[STREAM-007.8] Missing E2E configuration: ${item}`);
    fail('Full E2E preflight failed. Use a dedicated test account and READY video.', 2);
  }
  say('WARNING: --e2e will update watch-progress on the explicitly configured test account.');
}

const missingFiles = missingRequiredFiles(root);
if (missingFiles.length) {
  for (const file of missingFiles) console.error(`[STREAM-007.8] Missing file: ${file}`);
  fail('Required STREAM-007 artifacts are missing.');
}

function run(command, commandArgs, label, { capture = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail(
      `${label} (exit ${result.status ?? 'unavailable'}${result.error ? `: ${result.error.message}` : ''})`,
    );
  }
  return result.stdout ?? '';
}

say('Checking Git whitespace and tracked-file safety...');
run('git', ['rev-parse', '--is-inside-work-tree'], 'Not a Git repository', { capture: true });
run('git', ['diff', '--check'], 'Unstaged diff whitespace');
run('git', ['diff', '--cached', '--check'], 'Staged diff whitespace');
const tracked = run('git', ['ls-files', '-z'], 'Git tracked-file enumeration', { capture: true });
const flags = auditTrackedPaths(tracked.split('\0').filter(Boolean));
for (const file of flags.secrets) console.error(`[STREAM-007.8] Tracked environment file: ${file}`);
for (const file of flags.generated) console.error(`[STREAM-007.8] Tracked test artifact: ${file}`);
if (flags.secrets.length || flags.generated.length)
  fail(
    'Tracked secrets or generated browser artifacts must be reviewed and untracked before merge.',
  );
if (flags.inspect.length) {
  say('Review tracked key/certificate filenames (their contents are not inspected):');
  for (const file of flags.inspect) console.log(`  ${file}`);
}
const branch = run('git', ['branch', '--show-current'], 'Git branch inspection', {
  capture: true,
}).trim();
say(`Current branch: ${branch || '(detached HEAD)'}`);
if (!branch || ['main', 'master'].includes(branch))
  say('WARNING: review branch selection before committing/merging.');
const status = run('git', ['status', '--porcelain', '--untracked-files=normal'], 'Git status', {
  capture: true,
});
const count = status.split('\n').filter(Boolean).length;
say(`Git status: ${count} changed/untracked entries. Review before staging.`);
if (inspectOnly) {
  say('PASS: repository audit only. Unit/HTTP/build/E2E tests were NOT executed.');
  process.exit(0);
}

// Reuse the already-proven 12-gate runner, then specifically regress both 007.7 fixes.
const checks = [
  ['Closure auditor unit tests', 'node', ['--test', 'scripts/tests/verify-stream-007-8.test.mjs']],
  ['STREAM-007.6 12 offline gates', 'node', ['scripts/verify-stream-007-6.mjs']],
  [
    '007.7 discovery search / first-publication unit tests',
    'pnpm',
    [
      '--filter',
      '@streamlab/api',
      'exec',
      'node',
      '--import',
      'tsx',
      '--test',
      'tests/unit/discovery-search-pattern.test.ts',
      'tests/unit/video-publication.test.ts',
    ],
  ],
  [
    'Video publication update API regression',
    'pnpm',
    ['--filter', '@streamlab/api', 'test:video:update'],
  ],
  [
    'Creator visibility / metadata UI regression',
    'pnpm',
    ['--filter', '@streamlab/web', 'test:video:ui'],
  ],
];
if (withE2e)
  checks.push([
    'Full (writable) STREAM-007.6 Playwright suite',
    'node',
    ['scripts/run-stream-007-6.mjs', '--full'],
  ]);
for (const [i, [label, command, commandArgs]] of checks.entries()) {
  say(`Gate ${i + 1}/${checks.length}: ${label}`);
  run(command, commandArgs, label);
}
say(
  `PASS: ${checks.length}/${checks.length} final regression gates. Includes nested 12/12 offline checks.`,
);
if (!withE2e)
  say(
    'Live E2E not rerun here; previously reported 4/4 PASS. Option: --e2e (test-account write opt-in).',
  );
say(
  'Merge readiness depends on manual review of staged diff, documentation, and GitHub CI/PR status.',
);
