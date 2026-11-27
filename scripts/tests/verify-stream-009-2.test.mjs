import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const secretsScript = resolve(root, 'scripts/setup-auth-secrets.mjs');

function execute(cwd) {
  const result = spawnSync(process.execPath, [secretsScript], { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test('four secrets are generated without displaying them, and a repeat is a no-op', () => {
  const dir = mkdtempSync(join(tmpdir(), 'streamlab-hardening-'));
  try {
    const filename = join(dir, '.env');
    writeFileSync(
      filename,
      [
        'AUTH_ACCESS_TOKEN_SECRET=',
        'AUTH_REFRESH_TOKEN_HMAC_SECRET=',
        'AUTH_CSRF_SECRET=',
        'PLAYBACK_SIGNING_SECRET=',
        'CUSTOM_KEY=keep-me',
        '',
      ].join('\n'),
    );
    chmodSync(filename, 0o600);
    const first = execute(dir);
    const firstEnv = readFileSync(filename, 'utf8');
    const values = Object.fromEntries(
      firstEnv
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.split(/=(.*)/s).slice(0, 2)),
    );
    const keys = [
      'AUTH_ACCESS_TOKEN_SECRET',
      'AUTH_REFRESH_TOKEN_HMAC_SECRET',
      'AUTH_CSRF_SECRET',
      'PLAYBACK_SIGNING_SECRET',
    ];
    assert.match(first, /4 newly generated/);
    assert.equal(values.CUSTOM_KEY, 'keep-me');
    assert.equal(new Set(keys.map((key) => values[key])).size, 4);
    for (const key of keys) {
      assert.ok(values[key]?.length >= 32);
      assert.equal(first.includes(values[key]), false);
    }
    const second = execute(dir);
    assert.match(second, /0 newly generated/);
    assert.equal(readFileSync(filename, 'utf8'), firstEnv);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('source guardrails hold after 009.2 installation', () => {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/verify-stream-009-2.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /8\/8 static source checks/);
});
