import { UnrecoverableError } from 'bullmq';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Job } from 'bullmq';
import { VIDEO_TRANSCODE_JOB_NAME } from '@streamlab/contracts';
import {
  createVideoTranscodeProcessor,
  type TranscodingProcessorDependencies,
} from '../../src/processors/video-transcode.processor.js';

const data = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 1,
};
const token = '00000000-0000-4000-8000-000000000001';
function fixture(attemptsMade = 0, attempts = 3): Job<typeof data> {
  return {
    name: VIDEO_TRANSCODE_JOB_NAME,
    data,
    attemptsMade,
    opts: { attempts },
    moveToDelayed: async () => {},
  } as unknown as Job<typeof data>;
}
function dependencies() {
  const calls: string[] = [];
  const deps: TranscodingProcessorDependencies = {
    claim: async () => {
      calls.push('claim');
      return { kind: 'claimed', token, expiresAt: new Date(Date.now() + 1000) };
    },
    renew: async () => {
      calls.push('renew');
      return true;
    },
    release: async (_job, _token, action) => {
      calls.push(`release:${action}`);
      return true;
    },
    publishHls: async ({ claimToken }) => {
      assert.equal(claimToken, token);
      calls.push('publish');
    },
  };
  return { calls, deps };
}

test('finishes only after publisher returns (publisher owns verified READY commit)', async () => {
  const { calls, deps } = dependencies();
  assert.deepEqual(await createVideoTranscodeProcessor(deps)(fixture()), {
    outcome: 'ready',
    videoId: data.videoId,
    processingVersion: 1,
  });
  assert.deepEqual(calls, ['claim', 'publish']);
});

test('stale job is skipped without any file or DB writes', async () => {
  const { calls, deps } = dependencies();
  deps.claim = async () => {
    calls.push('claim');
    return { kind: 'stale' };
  };
  assert.deepEqual(await createVideoTranscodeProcessor(deps)(fixture()), {
    outcome: 'stale',
    videoId: data.videoId,
    processingVersion: 1,
  });
  assert.deepEqual(calls, ['claim']);
});

test('busy lease moves BullMQ job to delayed using its worker lock token', async () => {
  const { calls, deps } = dependencies();
  deps.claim = async () => ({ kind: 'busy', retryAt: new Date(Date.now() + 5000) });
  const job = fixture();
  job.moveToDelayed = async (timestamp: number, lock?: string) => {
    assert.ok(timestamp > Date.now());
    assert.equal(lock, 'worker-lock');
    calls.push('delayed');
  };
  await assert.rejects(createVideoTranscodeProcessor(deps)(job, 'worker-lock'), {
    name: 'DelayedError',
  });
  assert.deepEqual(calls, ['delayed']);
});

test('processing error releases to QUEUED for retry and FAILED on terminal attempt', async () => {
  for (const attempt of [0, 2]) {
    const { calls, deps } = dependencies();
    deps.publishHls = async () => {
      calls.push('publish');
      throw new Error('ffmpeg-failed');
    };
    await assert.rejects(createVideoTranscodeProcessor(deps)(fixture(attempt)), /ffmpeg-failed/);
    assert.deepEqual(calls, ['claim', 'publish', `release:${attempt === 0 ? 'retry' : 'failed'}`]);
  }
});

test('unrecoverable errors mark FAILED even before retry budget is exhausted', async () => {
  const { calls, deps } = dependencies();
  deps.publishHls = async () => {
    throw new UnrecoverableError('invalid-media');
  };
  await assert.rejects(createVideoTranscodeProcessor(deps)(fixture(0, 3)), /invalid-media/);
  assert.deepEqual(calls, ['claim', 'release:failed']);
});

test('cannot silently complete when lease heartbeat reports lost ownership', async () => {
  const { calls, deps } = dependencies();
  deps.heartbeatMs = 1;
  deps.renew = async () => {
    calls.push('renew');
    return false;
  };
  deps.release = async () => {
    calls.push('release');
    return false;
  };
  deps.publishHls = async ({ signal }) => {
    calls.push('publish');
    // The referenced timer keeps the test event loop alive while heartbeat is unref'd.
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    if (signal.aborted) throw new Error('cancelled');
  };
  await assert.rejects(
    createVideoTranscodeProcessor(deps)(fixture()),
    /TRANSCODING_FAILURE_WITHOUT_LEASE_OWNERSHIP/,
  );
  assert.ok(calls.includes('renew'));
  assert.ok(calls.includes('release'));
});

test('rejects invalid queue payload before claim', async () => {
  const { calls, deps } = dependencies();
  await assert.rejects(
    createVideoTranscodeProcessor(deps)({
      ...fixture(),
      data: { ...data, processingVersion: 0 },
    } as Job<typeof data>),
  );
  assert.deepEqual(calls, []);
});
