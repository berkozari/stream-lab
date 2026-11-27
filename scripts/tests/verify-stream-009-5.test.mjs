import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { verify } from '../verify-stream-009-5.mjs';

test('STREAM-009.5 static source requirements', () => {
  assert.equal(verify(), true);
});
