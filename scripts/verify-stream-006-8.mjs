#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = new Set(process.argv.slice(2));
const supported = new Set(['--inspect-only', '--e2e', '--help']);

if ([...args].some((arg) => !supported.has(arg))) {
  console.error('Usage: node scripts/verify-stream-006-8.mjs [--inspect-only | --e2e]');
  process.exit(2);
}
if (args.has('--help')) {
  console.log('Usage: node scripts/verify-stream-006-8.mjs [--inspect-only | --e2e]');
  console.log(
    'Default: repository audit + STREAM-006.7 offline gates; --e2e additionally runs all 4 Playwright tests.',
  );
  process.exit(0);
}
if (args.has('--inspect-only') && args.has('--e2e')) {
  console.error('--inspect-only and --e2e cannot be used together.');
  process.exit(2);
}

const inspectOnly = args.has('--inspect-only');
const withE2e = args.has('--e2e');
const requiredFiles = [
  'scripts/verify-stream-006-7.mjs',
  'scripts/run-stream-006-playwright.mjs',
  'apps/web/tests/e2e/playback-flow.spec.ts',
  'apps/api/tests/integration/playback-security-headers.http.test.ts',
  'docs/stream-006-playback-test-plan.md',
  'docs/stream-006-playback-closure.md',
];
const failures = [];
function log(message) {
  console.log(`[STREAM-006.8] ${message}`);
}
function run(command, commandArgs, label, { quiet = false } = {}) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: 15 * 60_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    failures.push(label);
    console.error(
      `[STREAM-006.8] FAIL: ${label} (${result.error?.message ?? result.status ?? 'unknown'})`,
    );
  }
  return result;
}

log(`Repository: ${root}`);
for (const file of requiredFiles) {
  if (!existsSync(path.join(root, file))) failures.push(`Missing ${file}`);
}
if (failures.length) {
  console.error('[STREAM-006.8] Required STREAM-006.7/006.8 files are missing.');
  console.error(failures.map((failure) => `  - ${failure}`).join('\n'));
  process.exit(1);
}

// Credential mistakes should fail before the expensive regression (and must not log values).
if (withE2e) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const key of ['STREAMLAB_E2E_PLAYBACK_VIDEO_ID', 'STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID']) {
    if (!uuid.test(process.env[key] ?? '')) {
      console.error(`[STREAM-006.8] --e2e requires ${key} (existing READY video UUID).`);
      process.exit(2);
    }
  }
  if (process.env.STREAMLAB_E2E_PLAYBACK_RENEWAL !== '1') {
    console.error(
      '[STREAM-006.8] --e2e requires STREAMLAB_E2E_PLAYBACK_RENEWAL=1 (API playback TTL must be 60 seconds).',
    );
    process.exit(2);
  }
  const hasEmail = Boolean(process.env.STREAMLAB_E2E_PLAYBACK_EMAIL);
  const hasPassword = Boolean(process.env.STREAMLAB_E2E_PLAYBACK_PASSWORD);
  if (hasEmail !== hasPassword) {
    console.error('[STREAM-006.8] Set both playback login variables, or neither (public fixture).');
    process.exit(2);
  }
}

log('Checking unstaged diff whitespace...');
run('git', ['diff', '--check'], 'git diff --check');
log('Checking staged diff whitespace...');
run('git', ['diff', '--cached', '--check'], 'git diff --cached --check');

const tracked = spawnSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'buffer',
  maxBuffer: 8 * 1024 * 1024,
});
if (tracked.status !== 0 || tracked.error) {
  failures.push('Unable to inspect tracked files');
} else {
  const files = tracked.stdout.toString('utf8').split('\0').filter(Boolean);
  const secretFiles = files.filter((file) => {
    const name = path.posix.basename(file.replaceAll('\\', '/'));
    if (/^\.env(?:\.|$)/.test(name)) {
      return !/\.env\.(?:example|sample|template)$/.test(name);
    }
    return false;
  });
  const generatedFiles = files.filter((file) =>
    /(^|\/)(?:test-results|playwright-report)(\/|$)/.test(file),
  );
  if (secretFiles.length) {
    failures.push('Potential secret env files tracked in Git');
    console.error(
      '[STREAM-006.8] Tracked environment files need inspection (no contents printed):',
    );
    for (const file of secretFiles) console.error(`  ${file}`);
  }
  if (generatedFiles.length) {
    failures.push('Playwright output tracked in Git');
    console.error('[STREAM-006.8] Test artifacts tracked in Git:');
    for (const file of generatedFiles.slice(0, 20)) console.error(`  ${file}`);
  }
}

const currentBranch = spawnSync('git', ['branch', '--show-current'], {
  cwd: root,
  encoding: 'utf8',
});
if (currentBranch.status !== 0) failures.push('Unable to inspect Git branch');
else log(`Current branch: ${currentBranch.stdout.trim() || '(detached HEAD)'}`);
const status = spawnSync('git', ['status', '--short', '--untracked-files=normal'], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (status.status !== 0) failures.push('Unable to inspect Git status');
else {
  const lines = status.stdout.trim().split('\n').filter(Boolean);
  log(`Working tree: ${lines.length} changed/untracked status entries`);
  if (lines.length) log('Review `git status --short` and `git diff --stat` before committing.');
}

if (inspectOnly) {
  log(
    failures.length
      ? 'STRUCTURAL INSPECTION FAIL'
      : 'STRUCTURAL INSPECTION PASS (offline/E2E tests NOT executed)',
  );
  process.exit(failures.length ? 1 : 0);
}

log('Running the existing STREAM-006.7 11-gate offline regression...');
run(process.execPath, ['scripts/verify-stream-006-7.mjs'], 'STREAM-006.7 offline regression');
if (withE2e) {
  log('Running full real-browser Playwright playback suite (4 tests; fixtures required)...');
  run(process.execPath, ['scripts/run-stream-006-playwright.mjs'], 'STREAM-006.7 Playwright E2E');
} else {
  log('Browser E2E NOT re-run; use --e2e for final evidence.');
}
if (failures.length) {
  log(`FAIL (${failures.length}): ${failures.join('; ')}`);
  process.exit(1);
}
log(`PASS: Git/secret audit + offline regression${withE2e ? ' + Playwright E2E' : ''}.`);
log('Manual actions remain: review diffs, reset local token TTL if changed, commit, PR/merge.');
