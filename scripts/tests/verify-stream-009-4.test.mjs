import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { auditAnalyticsLifecycle } from '../lib/stream-009-4-audit.mjs';

const results = await auditAnalyticsLifecycle(resolve(process.cwd()));
for (const result of results) {
  test(`STREAM-009.4: ${result.name}`, () => {
    assert.equal(result.passed, true, result.reason ?? result.name);
  });
}
