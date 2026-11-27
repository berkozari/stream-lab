#!/usr/bin/env node
/** STREAM-009.8: read-only repository inspection and optional offline regression.
 * Never deploys, migrates, writes analytics, executes browser E2E or changes Git.
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  auditClosureSources,
  checkTrackedFiles,
  missingRequiredFiles,
  offlineGates,
  parseMode,
} from './lib/stream-009-8-audit.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const say = (message) => console.log(`[STREAM-009.8] ${message}`);
const fail = (message, status = 1) => {
  console.error(`[STREAM-009.8] FAIL: ${message}`);
  process.exit(status);
};

let mode;
try {
  mode = parseMode(process.argv.slice(2));
} catch (error) {
  fail(error.message, 2);
}

if (mode === '--help') {
  say('Usage: node scripts/verify-stream-009-8.mjs [--plan|--inspect-only|--offline]');
  say(
    'Default / --inspect-only: check evidence files, source contracts, Git paths and whitespace.',
  );
  say('--plan: print offline gates without executing them or requiring Git.');
  say(
    '--offline: inspect, then run static evidence, unit, lint, typecheck, build and existing regressions.',
  );
  say('No mode contacts production services, writes to a DB, runs browser E2E or deploys.');
  process.exit(0);
}

if (mode === '--plan') {
  for (const [index, [label]] of offlineGates().entries()) {
    say(`Gate ${index + 1}: ${label}`);
  }
  say(
    'No operations executed. CI, staging DB, Docker, browser, backup/restore and TLS remain manual.',
  );
  process.exit(0);
}

function run(command, args, label, capture = false) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: process.env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    fail(
      `${label} (exit ${result.status ?? 'unknown'}${result.error ? `: ${result.error.message}` : ''})`,
    );
  }
  return result.stdout ?? '';
}

const missing = missingRequiredFiles(root);
if (missing.length > 0) {
  for (const file of missing) console.error(`[STREAM-009.8] Missing: ${file}`);
  fail('Missing milestone source or verification files.');
}

const sourceChecks = auditClosureSources(root);
for (const [label, ok] of sourceChecks) say(`${ok ? 'PASS' : 'FAIL'}: ${label}`);
if (sourceChecks.some(([, ok]) => !ok)) fail('Closure source audit failed.');
say(`PASS: ${sourceChecks.length}/${sourceChecks.length} closure source checks.`);

run('git', ['rev-parse', '--is-inside-work-tree'], 'Git repository', true);
run('git', ['diff', '--check'], 'Unstaged whitespace');
run('git', ['diff', '--cached', '--check'], 'Staged whitespace');
const tracked = run('git', ['ls-files', '--cached', '-z'], 'Tracked filenames', true);
const trackedNames = tracked.split('\0').filter(Boolean);
if (trackedNames.length === 0) fail('No tracked files found. Inspect the intended Git checkout.');
const paths = checkTrackedFiles(trackedNames);
for (const file of paths.blocked) console.error(`[STREAM-009.8] Unsafe tracked path: ${file}`);
if (paths.blocked.length) fail('Tracked environment secret or generated test artifact detected.');
for (const file of paths.review) say(`REVIEW: tracked key/certificate filename: ${file}`);
const branch = run('git', ['branch', '--show-current'], 'Git branch', true).trim();
say(`Branch: ${branch || '(detached HEAD)'}`);
if (!branch || branch === 'main' || branch === 'master') {
  say('WARN: perform PR review from the intended feature branch before merge.');
}
const status = run(
  'git',
  ['status', '--porcelain', '--untracked-files=normal'],
  'Git status',
  true,
);
say(
  `Changed / untracked entries: ${status.split('\n').filter(Boolean).length}. Review staged diff manually.`,
);

if (mode === '--inspect-only') {
  say('PASS: read-only repository inspection; no tests or runtime operations executed.');
  say('Production readiness NOT certified. Review docs/stream-009-milestone-closure.md.');
  process.exit(0);
}

const gates = offlineGates();
for (const [index, [label, command, args]] of gates.entries()) {
  say(`Gate ${index + 1}/${gates.length}: ${label}`);
  run(command, args, label);
}
say(`PASS: ${gates.length}/${gates.length} offline regression gates.`);
say(
  'Live PostgreSQL/Redis, real Docker, GitHub CI, staging, browser E2E and release approval NOT certified.',
);
