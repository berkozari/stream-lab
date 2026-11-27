import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UnrecoverableError } from 'bullmq';
import {
  assertSourceScratchCapacity,
  assertTranscodingResources,
  readTranscodingBudget,
} from '../../src/services/transcoding/resource-budget.js';

const signal = new AbortController().signal;
const probe = {
  durationSeconds: 30,
  width: 1280,
  height: 720,
  codec: 'h264',
  hasAudio: true,
};
const budget = readTranscodingBudget({});

test('budget defaults are bounded; malformed configuration cannot silently disable limits', () => {
  assert.equal(budget.maxDurationSeconds, 14_400);
  assert.equal(budget.maxSourcePixels, 8_294_400);
  assert.equal(budget.ffmpegThreads, 2);
  assert.equal(budget.minScratchFreeBytes, 536_870_912n);
  for (const env of [
    { TRANSCODE_MAX_DURATION_SECONDS: '0' },
    { TRANSCODE_FFMPEG_THREADS: '0' },
    { TRANSCODE_MIN_SCRATCH_FREE_BYTES: '-1' },
    { TRANSCODE_MAX_SOURCE_PIXELS: 'NaN' },
    { TRANSCODE_FFMPEG_PROFILE_TIMEOUT_MS: '7200001' },
  ]) {
    assert.throws(() => readTranscodingBudget(env), /TRANSCODING_CONFIG_INVALID/u);
  }
});

test('original download is rejected before IO when source + reserved free disk do not fit', async () => {
  await assert.rejects(
    assertSourceScratchCapacity(5n, signal, {
      budget: { ...budget, minScratchFreeBytes: 10n },
      availableBytes: async () => 14n,
    }),
    /TRANSCODING_SCRATCH_INSUFFICIENT/u,
  );
  await assertSourceScratchCapacity(5n, signal, {
    budget: { ...budget, minScratchFreeBytes: 10n },
    availableBytes: async () => 15n,
  });
});

test('nonpositive source size is terminal; scratch measurement errors remain retryable', async () => {
  await assert.rejects(assertSourceScratchCapacity(0n, signal), UnrecoverableError);
  await assert.rejects(
    assertSourceScratchCapacity(1n, signal, {
      availableBytes: async () => {
        throw new Error('filesystem temporarily unavailable');
      },
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'TRANSCODING_SCRATCH_CHECK_FAILED' &&
      !(error instanceof UnrecoverableError),
  );
});

test('duration and source pixels are permanent admission failures', async () => {
  for (const media of [
    { ...probe, durationSeconds: 14_401 },
    { ...probe, width: 7680, height: 4320 },
  ]) {
    await assert.rejects(
      assertTranscodingResources(media, signal, { budget }),
      (error: unknown) =>
        error instanceof UnrecoverableError &&
        error.message === 'TRANSCODING_MEDIA_BUDGET_EXCEEDED',
    );
  }
});

test('large rendition manifests cannot exceed orphan reaper cleanup capacity', async () => {
  await assert.rejects(
    assertTranscodingResources(
      { ...probe, width: 1920, height: 1080, durationSeconds: 20_000 },
      signal,
      {
        budget: { ...budget, maxDurationSeconds: 86_400 },
        availableBytes: async () => 1_000_000_000_000n,
      },
    ),
    (error: unknown) =>
      error instanceof UnrecoverableError &&
      error.message === 'TRANSCODING_HLS_OBJECT_BUDGET_EXCEEDED',
  );
});

test('post-probe estimated output checks disk without prematurely committing READY', async () => {
  await assert.rejects(
    assertTranscodingResources(probe, signal, {
      budget,
      availableBytes: async () => 1n,
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'TRANSCODING_SCRATCH_INSUFFICIENT' &&
      !(error instanceof UnrecoverableError),
  );
  await assertTranscodingResources(probe, signal, {
    budget,
    availableBytes: async () => 1_000_000_000_000n,
  });
});

test('abort prevents scratch checks from continuing a cancelled attempt', async () => {
  const stopped = new AbortController();
  stopped.abort();
  let measured = false;
  await assert.rejects(
    assertSourceScratchCapacity(1n, stopped.signal, {
      availableBytes: async () => {
        measured = true;
        return 1_000_000_000_000n;
      },
    }),
    /TRANSCODING_CANCELLED/u,
  );
  assert.equal(measured, false);
});
