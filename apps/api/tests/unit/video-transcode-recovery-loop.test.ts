import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { startTranscodingRecoveryLoop } from '../../src/services/video-transcode-recovery-loop.js';

const empty = { checked: 0, redispatched: 0, terminalFailed: 0, preserved: 0, raced: 0, errors: 0 };

test('recovery scans never overlap; stop drains active scan', async () => {
  let active = 0;
  let maxActive = 0;
  let calls = 0;
  const stop = startTranscodingRecoveryLoop({
    intervalMs: 2,
    reconcile: async () => {
      calls++;
      maxActive = Math.max(maxActive, ++active);
      await delay(15);
      active--;
      return empty;
    },
  });
  await delay(55);
  await stop();
  const lastCount = calls;
  await delay(15);
  assert.ok(lastCount >= 2);
  assert.equal(maxActive, 1);
  assert.equal(active, 0);
  assert.equal(calls, lastCount);
});

test('recovery loop interval must be bounded', () => {
  assert.throws(() => startTranscodingRecoveryLoop({ intervalMs: 0 }), RangeError);
  assert.throws(() => startTranscodingRecoveryLoop({ intervalMs: 600_001 }), RangeError);
});
