#!/usr/bin/env node
/**
 * STREAM-008.9 final milestone check. Reads Git filenames/status and executes test
 * runners; NEVER modifies Git, DB schemas, user data or application source.
 * Optional --e2e runs a WRITABLE browser scenario with explicit consent only.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditTrackedPaths,
  missingRequiredFiles,
  missingWritableE2eConfig,
} from './lib/stream-008-closure-audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(['--inspect-only', '--e2e', '--help']);
const say = (message) => console.log(`[STREAM-008.9] ${message}`);
function fail(message, code = 1) {
  console.error(`[STREAM-008.9] FAIL: ${message}`);
  process.exit(code);
}
if (args.some((arg) => !flags.has(arg)) || new Set(args).size !== args.length) {
  fail('Usage: node scripts/verify-stream-008-9.mjs [--inspect-only | --e2e | --help]', 2);
}
if (args.includes('--help')) {
  say('Usage: node scripts/verify-stream-008-9.mjs [--inspect-only | --e2e]');
  say('Default: Git path audit and offline regression; never writes analytics.');
  say('--inspect-only: audit Git paths/status and required files; skip test execution.');
  say('--e2e: additionally rerun the four-test browser suite, WRITING analytics test data.');
  process.exit(0);
}
if (args.includes('--inspect-only') && args.includes('--e2e')) {
  fail('--inspect-only and --e2e cannot be combined', 2);
}
const withE2e = args.includes('--e2e');
if (withE2e) {
  const missing = missingWritableE2eConfig(process.env);
  if (missing.length) {
    for (const item of missing) console.error(`[STREAM-008.9] Missing E2E setting: ${item}`);
    fail('Writable browser E2E requires a dedicated test account/video and explicit opt-in.', 2);
  }
  say('WARNING: --e2e creates persistent playback analytics data for the configured test video.');
}
const absent = missingRequiredFiles(root);
if (absent.length) {
  for (const item of absent) console.error(`[STREAM-008.9] Missing file: ${item}`);
  fail('Required STREAM-008 files are missing. Run from the installed milestone repository.');
}
function run(command, commandArgs, label, capture = false) {
  const outcome = spawnSync(command, commandArgs, {
    cwd: root,
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (outcome.error || outcome.status !== 0) {
    fail(
      `${label} (exit ${outcome.status ?? 'unknown'}${outcome.error ? `: ${outcome.error.message}` : ''})`,
    );
  }
  return outcome.stdout ?? '';
}

say('Checking tracked filenames, Git diffs and current branch...');
run('git', ['rev-parse', '--is-inside-work-tree'], 'Git repository check', true);
run('git', ['diff', '--check'], 'Unstaged whitespace check');
run('git', ['diff', '--cached', '--check'], 'Staged whitespace check');
const tracked = run('git', ['ls-files', '--cached', '-z'], 'Tracked file list', true);
const report = auditTrackedPaths(tracked.split('\0').filter(Boolean));
for (const item of report.secrets)
  console.error(`[STREAM-008.9] Tracked env secret candidate: ${item}`);
for (const item of report.generated)
  console.error(`[STREAM-008.9] Tracked test/credential artifact: ${item}`);
if (report.secrets.length || report.generated.length) {
  fail('Remove tracked environment secrets or generated browser artifacts before merge.');
}
for (const item of report.review) say(`Review tracked key/certificate file before merge: ${item}`);
const branch = run('git', ['branch', '--show-current'], 'Branch check', true).trim();
say(`Branch: ${branch || '(detached HEAD)'}`);
if (!branch || ['main', 'master'].includes(branch)) {
  say('WARNING: expected a STREAM-008 feature/PR branch for milestone merge.');
}
const changed = run(
  'git',
  ['status', '--porcelain', '--untracked-files=normal'],
  'Worktree state',
  true,
);
const changeCount = changed.split('\n').filter(Boolean).length;
say(`Git changed/untracked entries: ${changeCount}. Review every staged file before committing.`);
if (args.includes('--inspect-only')) {
  say('PASS: repository inspection. No tests or browser actions were executed.');
  process.exit(0);
}

const gates = [
  ['Closure auditor unit tests', 'node', ['--test', 'scripts/tests/verify-stream-008-9.test.mjs']],
  [
    'STREAM-008.8 offline suite (includes STREAM-008.7)',
    'node',
    ['scripts/verify-stream-008-8.mjs'],
  ],
  ['API playback security regression', 'pnpm', ['--filter', '@streamlab/api', 'test:playback']],
  [
    'Creator video management UI regression',
    'pnpm',
    ['--filter', '@streamlab/web', 'test:video:ui'],
  ],
];
if (withE2e)
  gates.push([
    'Writable STREAM-008.8 browser E2E',
    'node',
    ['scripts/run-stream-008-8.mjs', '--full'],
  ]);
for (const [index, [label, command, commandArgs]] of gates.entries()) {
  say(`Gate ${index + 1}/${gates.length}: ${label}`);
  run(command, commandArgs, label);
}
say(
  `PASS: ${gates.length}/${gates.length} final regression gates. Nested STREAM-008.8 and 008.7 gates included.`,
);
if (!withE2e) {
  say('Browser E2E NOT rerun. User previously reported read 3/3 and write 1/1 PASS separately.');
  say('Optional read-only browser recheck: node scripts/run-stream-008-8.mjs --read');
}
say('Before merge: manually verify Prisma migration status, staged diff, CI and PR review.');
