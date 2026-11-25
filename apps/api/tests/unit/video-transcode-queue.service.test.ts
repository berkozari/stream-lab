import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { VideoTranscodeJobData } from '@streamlab/contracts';
import {
  createEnqueueVideoTranscode,
  type TranscodingJobAdder,
} from '../../src/services/video-transcode-queue.service.js';

const videoId = randomUUID();
const payload: VideoTranscodeJobData = { contractVersion: 1, videoId, processingVersion: 1 };

test('valid job payload produces stable ID, bounded retries and no leaked metadata', async () => {
  let calls = 0;
  const add: TranscodingJobAdder = async (name, data, options) => {
    calls += 1;
    assert.equal(name, 'video.transcode');
    assert.deepEqual(data, payload);
    assert.equal(options.jobId, `transcode-${videoId}-1`);
    assert.equal(options.attempts, 3);
    assert.deepEqual(options.backoff, { type: 'exponential', delay: 5_000 });
    assert.ok(options.removeOnComplete);
    assert.ok(options.removeOnFail);
    assert.equal(Object.keys(data).sort().join(','), 'contractVersion,processingVersion,videoId');
    return { id: options.jobId };
  };
  const enqueue = createEnqueueVideoTranscode(add);
  const first = await enqueue(payload);
  assert.equal(await enqueue({ ...payload }), first);
  assert.equal(calls, 2);
});

test('malformed payload never reaches Redis', async () => {
  let calls = 0;
  const enqueue = createEnqueueVideoTranscode(async () => {
    calls += 1;
    return { id: 'unreachable' };
  });
  await assert.rejects(
    enqueue({ ...payload, storageKey: 'private/source' } as VideoTranscodeJobData),
  );
  await assert.rejects(enqueue({ ...payload, processingVersion: 0 }));
  assert.equal(calls, 0);
});

test('Redis failure propagates and cannot be mistaken for successful enqueue', async () => {
  const enqueue = createEnqueueVideoTranscode(async () => {
    throw new Error('Redis unavailable');
  });
  await assert.rejects(enqueue(payload), /Redis unavailable/);
});

test('producer refuses a missing or unexpected job id', async () => {
  const missing = createEnqueueVideoTranscode(async () => undefined);
  const wrong = createEnqueueVideoTranscode(async () => ({ id: 'other-job' }));
  await assert.rejects(missing(payload), /unexpected job ID/);
  await assert.rejects(wrong(payload), /unexpected job ID/);
});
