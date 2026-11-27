import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('STREAM-009.7 static evidence audit completes 8/8', () => {
  const script = fileURLToPath(new URL('../verify-stream-009-7.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /8\/8 static checks PASS/u);
});
