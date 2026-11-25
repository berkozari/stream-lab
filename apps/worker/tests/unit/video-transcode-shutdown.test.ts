import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job } from 'bullmq';
import { VIDEO_TRANSCODE_JOB_NAME } from '@streamlab/contracts';
import {
  createVideoTranscodeProcessor,
  type TranscodingProcessorDependencies,
} from '../../src/processors/video-transcode.processor.js';

const jobData = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 1,
};
const claimToken = '00000000-0000-4000-8000-000000000001';

function setup() {
  const controller = new AbortController();
  const events: string[] = [];
  const job = {
    name: VIDEO_TRANSCODE_JOB_NAME,
    data: jobData,
    attemptsMade: 2,
    opts: { attempts: 3 },
    moveToDelayed: async (until: number, token: string) => {
      assert.ok(until > Date.now());
      assert.equal(token, 'bullmq-lock');
      events.push('delay');
    },
  } as unknown as Job<typeof jobData>;
  const deps: TranscodingProcessorDependencies = {
    shutdownSignal: controller.signal,
    claim: async () => {
      events.push('claim');
      return { kind: 'claimed', token: claimToken, expiresAt: new Date(Date.now() + 300_000) };
    },
    renew: async () => true,
    release: async (_job, token, action) => {
      assert.equal(token, claimToken);
      events.push(`release:${action}`);
      return true;
    },
    publishHls: async () => {
      events.push('publish');
    },
  };
  return { controller, events, deps, job };
}

test('shutdown before claim delays job without a DB claim or an attempt', async () => {
  const { controller, events, deps, job } = setup();
  controller.abort();
  await assert.rejects(createVideoTranscodeProcessor(deps)(job, 'bullmq-lock'), {
    name: 'DelayedError',
  });
  assert.deepEqual(events, ['delay']);
});

test('shutdown during publish aborts media work and parks the job without marking FAILED', async () => {
  const { controller, events, deps, job } = setup();
  deps.publishHls = async ({ signal }) => {
    events.push('publish');
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) return reject(new Error('TRANSCODING_CANCELLED'));
      signal.addEventListener('abort', () => reject(new Error('TRANSCODING_CANCELLED')), {
        once: true,
      });
      setImmediate(() => controller.abort());
    });
  };
  await assert.rejects(createVideoTranscodeProcessor(deps)(job, 'bullmq-lock'), {
    name: 'DelayedError',
  });
  assert.deepEqual(events, ['claim', 'publish', 'delay', 'release:retry']);
});

test('a DB failure after delaying leaves job retryable for lease-based recovery', async () => {
  const { events, deps, job } = setup();
  // Race shutdown just after taking the database claim.
  const fresh = new AbortController();
  deps.shutdownSignal = fresh.signal;
  deps.claim = async () => {
    events.push('claim');
    fresh.abort();
    return { kind: 'claimed', token: claimToken, expiresAt: new Date(Date.now() + 300_000) };
  };
  deps.release = async () => {
    events.push('release-error');
    throw new Error('postgres unavailable');
  };
  await assert.rejects(createVideoTranscodeProcessor(deps)(job, 'bullmq-lock'), {
    name: 'DelayedError',
  });
  assert.deepEqual(events, ['claim', 'delay', 'release-error']);
});

test('shutdown immediately after a completed READY commit does not roll back success', async () => {
  const { controller, events, deps, job } = setup();
  deps.publishHls = async ({ beforeReadyCommit }) => {
    events.push('publish');
    await beforeReadyCommit();
    events.push('ready-committed');
    controller.abort();
  };
  assert.deepEqual(await createVideoTranscodeProcessor(deps)(job, 'bullmq-lock'), {
    outcome: 'ready',
    videoId: jobData.videoId,
    processingVersion: jobData.processingVersion,
  });
  assert.deepEqual(events, ['claim', 'publish', 'ready-committed']);
});

test('Redis outage during parking does not release the database lease prematurely', async () => {
  const { events, deps, job } = setup();
  const shutdown = new AbortController();
  deps.shutdownSignal = shutdown.signal;
  deps.claim = async () => {
    events.push('claim');
    shutdown.abort();
    return { kind: 'claimed', token: claimToken, expiresAt: new Date(Date.now() + 300_000) };
  };
  job.moveToDelayed = async () => {
    events.push('redis-error');
    throw new Error('redis unavailable');
  };
  await assert.rejects(
    createVideoTranscodeProcessor(deps)(job, 'bullmq-lock'),
    /redis unavailable/,
  );
  assert.deepEqual(events, ['claim', 'redis-error']);
});
