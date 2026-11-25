import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { TranscodingDispatchClaim } from '../../src/repositories/video-transcode-outbox.repository.js';
import type { TranscodingDispatchDependencies } from '../../src/services/video-transcode-dispatch.service.js';

process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:5432/streamlab_unit';
const { createDispatchTranscodingOutbox } =
  await import('../../src/services/video-transcode-dispatch.service.js');

const videoId = randomUUID();
const claim: TranscodingDispatchClaim = {
  id: randomUUID(),
  videoId,
  processingVersion: 3,
  jobId: `transcode-${videoId}-3`,
  claimToken: randomUUID(),
  attempts: 1,
};
function deps(overrides: Partial<TranscodingDispatchDependencies> = {}) {
  const calls: string[] = [];
  const defaults: TranscodingDispatchDependencies = {
    claim: async (limit) => {
      assert.equal(limit, 20);
      calls.push('claim');
      return [claim];
    },
    eligible: async () => {
      calls.push('eligible');
      return true;
    },
    enqueue: async (payload) => {
      calls.push('enqueue');
      assert.deepEqual(payload, { contractVersion: 1, videoId, processingVersion: 3 });
      return claim.jobId;
    },
    dispatched: async () => {
      calls.push('dispatched');
    },
    defer: async () => {
      calls.push('defer');
    },
    cancel: async () => {
      calls.push('cancel');
    },
  };
  return { calls, dependencies: { ...defaults, ...overrides } };
}

test('only a valid QUEUED version is sent to BullMQ and marked dispatched', async () => {
  const fake = deps();
  const summary = await createDispatchTranscodingOutbox(fake.dependencies)();
  assert.deepEqual(summary, { claimed: 1, dispatched: 1, deferred: 0, cancelled: 0 });
  assert.deepEqual(fake.calls, ['claim', 'eligible', 'enqueue', 'dispatched']);
});

test('deleted, stale or already-processing video is cancelled without enqueue', async () => {
  const fake = deps({
    eligible: async () => {
      fake.calls.push('eligible');
      return false;
    },
  });
  const summary = await createDispatchTranscodingOutbox(fake.dependencies)();
  assert.deepEqual(summary, { claimed: 1, dispatched: 0, deferred: 0, cancelled: 1 });
  assert.deepEqual(fake.calls, ['claim', 'eligible', 'cancel']);
});

test('Redis failure defers the outbox claim rather than losing the job', async () => {
  const fake = deps({
    enqueue: async () => {
      fake.calls.push('enqueue');
      throw new Error('Redis offline');
    },
  });
  const summary = await createDispatchTranscodingOutbox(fake.dependencies)();
  assert.deepEqual(summary, { claimed: 1, dispatched: 0, deferred: 1, cancelled: 0 });
  assert.deepEqual(fake.calls, ['claim', 'eligible', 'enqueue', 'defer']);
});

test('failed post-Redis acknowledgement defers; stable job ID makes replay safe', async () => {
  const fake = deps({
    dispatched: async () => {
      fake.calls.push('dispatched');
      throw new Error('Database offline');
    },
  });
  const summary = await createDispatchTranscodingOutbox(fake.dependencies)();
  assert.deepEqual(summary, { claimed: 1, dispatched: 0, deferred: 1, cancelled: 0 });
  assert.deepEqual(fake.calls, ['claim', 'eligible', 'enqueue', 'dispatched', 'defer']);
});

test('failed claim query fails the batch rather than inventing dispatched jobs', async () => {
  const fake = deps({
    claim: async () => {
      throw new Error('DB unavailable');
    },
  });
  await assert.rejects(createDispatchTranscodingOutbox(fake.dependencies)(), /DB unavailable/);
});
