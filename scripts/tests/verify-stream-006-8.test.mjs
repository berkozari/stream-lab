import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = fileURLToPath(new URL('../verify-stream-006-8.mjs', import.meta.url));
const required = [
  'scripts/verify-stream-006-7.mjs',
  'scripts/run-stream-006-playwright.mjs',
  'apps/web/tests/e2e/playback-flow.spec.ts',
  'apps/api/tests/integration/playback-security-headers.http.test.ts',
  'docs/stream-006-playback-test-plan.md',
  'docs/stream-006-playback-closure.md',
];
function fixture(callback) {
  const root = mkdtempSync(path.join(tmpdir(), 'stream-0068-'));
  try {
    for (const file of [...required, 'scripts/verify-stream-006-8.mjs']) {
      const target = path.join(root, file);
      mkdirSync(path.dirname(target), { recursive: true });
      if (file.endsWith('verify-stream-006-8.mjs')) copyFileSync(source, target);
      else writeFileSync(target, 'fixture\n');
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    callback(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function run(root, args, env = process.env) {
  return spawnSync(
    process.execPath,
    [path.join(root, 'scripts/verify-stream-006-8.mjs'), ...args],
    {
      cwd: root,
      encoding: 'utf8',
      env,
    },
  );
}

test('inspect-only accepts valid structural fixture without running tests', () => {
  fixture((root) => {
    const result = run(root, ['--inspect-only']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /STRUCTURAL INSPECTION PASS/);
    assert.match(result.stdout, /tests NOT executed/);
  });
});

test('inspect-only rejects a tracked real .env file but accepts .env.example', () => {
  fixture((root) => {
    writeFileSync(path.join(root, '.env.example'), 'SAFE=example\n');
    execFileSync('git', ['add', '.env.example'], { cwd: root });
    assert.equal(run(root, ['--inspect-only']).status, 0);
    writeFileSync(path.join(root, '.env'), 'PRIVATE=do-not-print\n');
    execFileSync('git', ['add', '-f', '.env'], { cwd: root });
    const result = run(root, ['--inspect-only']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Tracked environment files/);
    assert.doesNotMatch(result.stderr + result.stdout, /do-not-print/);
  });
});

test('--e2e validates both fixtures and renewal opt-in before running offline regression', () => {
  fixture((root) => {
    const result = run(root, ['--e2e'], {
      ...process.env,
      STREAMLAB_E2E_PLAYBACK_VIDEO_ID: '',
      STREAMLAB_E2E_PLAYBACK_ABR_VIDEO_ID: '',
      STREAMLAB_E2E_PLAYBACK_RENEWAL: '',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /requires STREAMLAB_E2E_PLAYBACK_VIDEO_ID/);
    assert.doesNotMatch(result.stdout, /Running the existing/);
  });
});

test('disallows contradictory execution flags', () => {
  fixture((root) => {
    const result = run(root, ['--inspect-only', '--e2e']);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /cannot be used together/);
  });
});
