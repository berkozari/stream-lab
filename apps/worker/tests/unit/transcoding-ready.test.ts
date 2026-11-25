import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PublishReadyInput } from '../../src/repositories/transcoding-publish.repository.js';

// This test uses a stubbed transaction and never connects to PostgreSQL.
process.env.DATABASE_URL ??= 'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder';
const { commitTranscodingReady } =
  await import('../../src/repositories/transcoding-publish.repository.js');
const job = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 2,
};
const token = '00000000-0000-4000-8000-000000000001';
function input(): PublishReadyInput {
  return {
    job,
    claimToken: token,
    durationSeconds: 2.1,
    masterKey: 'hls/master.m3u8',
    masterSizeBytes: 12n,
    profiles: [{ label: '240p', width: 320, height: 240, videoBitrate: 400_000, audioBitrate: 0 }],
    keyFor: (path) => `hls/${path}`,
  };
}

test('updates video + master + renditions within one transactional scope', async () => {
  const steps: string[] = [];
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        video: {
          updateMany: async (payload: {
            where: Record<string, unknown>;
            data: Record<string, unknown>;
          }) => {
            assert.equal(payload.where.processingLeaseToken, token);
            assert.equal(payload.where.status, 'PROCESSING');
            assert.equal(payload.data.status, 'READY');
            assert.equal(payload.data.durationSeconds, 3);
            steps.push('cas');
            return { count: 1 };
          },
        },
        mediaAsset: {
          create: async () => {
            steps.push('master');
          },
        },
        videoRendition: {
          createMany: async () => {
            steps.push('renditions');
          },
        },
      }),
  };
  await commitTranscodingReady(input(), db as never);
  assert.deepEqual(steps, ['cas', 'master', 'renditions']);
});

test('stale claim never persists master or rendition data', async () => {
  const steps: string[] = [];
  const db = {
    $transaction: async (callback: (tx: unknown) => Promise<void>) =>
      callback({
        video: { updateMany: async () => ({ count: 0 }) },
        mediaAsset: {
          create: async () => {
            steps.push('invalid-master');
          },
        },
        videoRendition: {
          createMany: async () => {
            steps.push('invalid-rendition');
          },
        },
      }),
  };
  await assert.rejects(commitTranscodingReady(input(), db as never), /TRANSCODING_LEASE_LOST/u);
  assert.deepEqual(steps, []);
});
