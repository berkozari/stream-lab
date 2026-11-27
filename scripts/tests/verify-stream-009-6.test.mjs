import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { audit } from '../verify-stream-009-6.mjs';

const root = resolve(import.meta.dirname, '../..');

test('STREAM-009.6 static evidence groups all pass in project tree', () => {
  const results = audit(root);
  assert.equal(results.length, 8);
  assert.ok(
    results.every(([, passed]) => passed),
    JSON.stringify(results.filter(([, ok]) => !ok)),
  );
});

test('missing source tree fails closed rather than giving false PASS', () => {
  const results = audit(resolve(root, 'does-not-exist'));
  assert.equal(results.length, 8);
  assert.ok(results.every(([, passed]) => !passed));
});

test('--plan lists offline gates without invoking package manager', () => {
  const stdout = execFileSync(
    process.execPath,
    [resolve(root, 'scripts/run-stream-009-6.mjs'), '--plan'],
    {
      encoding: 'utf8',
      cwd: root,
    },
  );
  assert.match(stdout, /Auth \/ CSRF/);
  assert.match(stdout, /Worker graceful shutdown/);
  assert.match(stdout, /No tests executed/);
});
