import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { startTranscodingOutboxDispatcher } from '../../src/services/video-transcode-dispatcher-loop.js';

const summary = { claimed: 0, dispatched: 0, deferred: 0, cancelled: 0 };

test('polls without overlapping batches and stops cleanly', async () => {
  let active = 0;
  let peak = 0;
  let calls = 0;
  const stop = startTranscodingOutboxDispatcher({
    intervalMs: 1,
    dispatch: async () => {
      calls++;
      active++;
      peak = Math.max(peak, active);
      await sleep(15);
      active--;
      return summary;
    },
    onProgress: () => {},
  });
  await sleep(50);
  await stop();
  const afterStop = calls;
  await sleep(20);
  assert.equal(active, 0);
  assert.equal(peak, 1);
  assert.ok(calls >= 2);
  assert.equal(calls, afterStop, 'stop must not schedule another batch');
});

test('Redis/database failures are reported and followed by a new attempt', async () => {
  let calls = 0;
  let errors = 0;
  let succeeded = false;
  const stop = startTranscodingOutboxDispatcher({
    intervalMs: 5,
    dispatch: async () => {
      calls++;
      if (calls === 1) throw new Error('Redis offline');
      succeeded = true;
      return summary;
    },
    onError: () => {
      errors++;
    },
    onProgress: () => {},
  });
  try {
    for (let i = 0; i < 30 && !succeeded; i++) await sleep(10);
    assert.equal(errors, 1);
    assert.equal(succeeded, true);
  } finally {
    await stop();
  }
});

test('rejects invalid polling intervals', () => {
  assert.throws(() => startTranscodingOutboxDispatcher({ intervalMs: 0 }), RangeError);
  assert.throws(() => startTranscodingOutboxDispatcher({ intervalMs: 60_001 }), RangeError);
});
