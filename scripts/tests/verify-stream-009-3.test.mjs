import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { auditWorkerHardening } from '../lib/stream-009-3-audit.mjs';

const results = await auditWorkerHardening(resolve(process.cwd()));
for (const result of results) {
  test(`STREAM-009.3: ${result.name}`, () => {
    assert.equal(result.passed, true, result.reason ?? result.name);
  });
}
