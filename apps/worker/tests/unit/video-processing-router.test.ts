import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job } from 'bullmq';
import { VIDEO_PROCESSING_SMOKE_JOB_NAME, VIDEO_TRANSCODE_JOB_NAME } from '@streamlab/contracts';
import { createVideoProcessingRouter } from '../../src/processors/video-processing.router.js';

const data = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 1,
};
const smoke = { requestId: 'req', queuedAt: '2026-11-24T10:00:00.000Z' };
function job(name: string, payload: unknown): Job {
  return { name, data: payload, attemptsMade: 0 } as Job;
}

test('routes smoke jobs without changing their result contract', async () => {
  const router = createVideoProcessingRouter(async () => {
    throw new Error('should not invoke transcode');
  });
  const result = await router(job(VIDEO_PROCESSING_SMOKE_JOB_NAME, smoke));
  assert.ok('requestId' in result);
  if ('requestId' in result) assert.equal(result.requestId, 'req');
});

test('validates and forwards a video.transcode payload', async () => {
  const seen: unknown[] = [];
  const router = createVideoProcessingRouter(async (input, lockToken) => {
    assert.equal(lockToken, 'lock-123');
    seen.push(input.data);
    return {
      outcome: 'ready',
      videoId: input.data.videoId,
      processingVersion: input.data.processingVersion,
    };
  });
  assert.deepEqual(await router(job(VIDEO_TRANSCODE_JOB_NAME, data), 'lock-123'), {
    outcome: 'ready',
    videoId: data.videoId,
    processingVersion: 1,
  });
  assert.deepEqual(seen, [data]);
});

test('rejects malformed transcode payload without invoking handler', async () => {
  let invoked = false;
  const router = createVideoProcessingRouter(async () => {
    invoked = true;
    throw new Error('not reached');
  });
  await assert.rejects(router(job(VIDEO_TRANSCODE_JOB_NAME, { ...data, processingVersion: 0 })));
  assert.equal(invoked, false);
});

test('unknown job names fail fast', async () => {
  const router = createVideoProcessingRouter(async () => {
    throw new Error('not reached');
  });
  await assert.rejects(router(job('unexpected.job', data)), /Unsupported video processing job/);
});
