import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProgressReporter,
  normalizeProgress,
  PROGRESS_REPORT_INTERVAL_MS,
} from '../src/features/watch-history/utils/progress-reporting.ts';

test('invalid positions are rejected and fractional seconds are normalized', () => {
  assert.equal(normalizeProgress(Number.NaN), null);
  assert.equal(normalizeProgress(-10), null);
  assert.deepEqual(normalizeProgress(12.9), { positionSeconds: 12, completed: false });
  assert.deepEqual(normalizeProgress(1e9, true), { positionSeconds: 864000, completed: true });
});

test('timeupdate records are throttled, forced seek and pause bypass the interval', async () => {
  let now = 0;
  const seen: number[] = [];
  const reporter = createProgressReporter(
    async ({ positionSeconds }) => {
      seen.push(positionSeconds);
    },
    undefined,
    () => now,
  );
  reporter.report({ positionSeconds: 10, completed: false });
  await reporter.whenIdle();
  now = 100;
  reporter.report({ positionSeconds: 11, completed: false });
  await reporter.whenIdle();
  reporter.report({ positionSeconds: 50, completed: false }, true);
  await reporter.whenIdle();
  now = PROGRESS_REPORT_INTERVAL_MS + 100;
  reporter.report({ positionSeconds: 66, completed: false });
  await reporter.whenIdle();
  assert.deepEqual(seen, [10, 50, 66]);
});

test('serializes outstanding requests and coalesces writes to latest position', async () => {
  let finish: (() => void) | undefined;
  const seen: number[] = [];
  const reporter = createProgressReporter(async ({ positionSeconds }) => {
    seen.push(positionSeconds);
    if (positionSeconds === 10)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
  });
  reporter.report({ positionSeconds: 10, completed: false });
  reporter.report({ positionSeconds: 20, completed: false }, true);
  reporter.report({ positionSeconds: 30, completed: true }, true);
  assert.deepEqual(seen, [10]);
  finish?.();
  await reporter.whenIdle();
  assert.deepEqual(seen, [10, 30]);
});

test('write failures do not reject and can recover at the next event', async () => {
  const failures: boolean[] = [];
  let calls = 0;
  const reporter = createProgressReporter(
    async () => {
      if (++calls === 1) throw new Error('offline');
    },
    (failed) => failures.push(failed),
  );
  reporter.report({ positionSeconds: 10, completed: false }, true);
  await reporter.whenIdle();
  reporter.report({ positionSeconds: 20, completed: false }, true);
  await reporter.whenIdle();
  assert.deepEqual(failures, [true, false]);
});

test('closed reporter does not send queued progress to another viewer', async () => {
  let finish: (() => void) | undefined;
  const seen: number[] = [];
  const reporter = createProgressReporter(async ({ positionSeconds }) => {
    seen.push(positionSeconds);
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
  reporter.report({ positionSeconds: 10, completed: false }, true);
  reporter.report({ positionSeconds: 20, completed: false }, true);
  reporter.close();
  finish?.();
  await reporter.whenIdle();
  assert.deepEqual(seen, [10]);
});
