import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { Prisma } from '../../src/generated/prisma/client.js';

// Prisma adapter construction should not require a live DB for unit tests.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:5432/streamlab_unit';
const { stageTranscodingInTransaction } =
  await import('../../src/repositories/video-transcode-outbox.repository.js');

const videoId = randomUUID();

function fakeTransaction(
  input: {
    original?: boolean;
    updatedCount?: number;
    version?: number;
    outboxError?: boolean;
  } = {},
) {
  const events: string[] = [];
  const outboxRows: Array<{ videoId: string; processingVersion: number; jobId: string }> = [];
  const tx = {
    mediaAsset: {
      findFirst: async (query: unknown) => {
        events.push('original');
        assert.deepEqual(query, { where: { videoId, kind: 'ORIGINAL' }, select: { id: true } });
        return input.original === false ? null : { id: randomUUID() };
      },
    },
    video: {
      updateMany: async (query: {
        where: { status: string; deletedAt: null; processingVersion: { lt: number } };
        data: { status: string; processingVersion: { increment: number } };
      }) => {
        events.push('cas');
        assert.equal(query.where.status, 'UPLOADED');
        assert.equal(query.where.deletedAt, null);
        assert.equal(query.where.processingVersion.lt, 2_147_483_647);
        assert.deepEqual(query.data, { status: 'QUEUED', processingVersion: { increment: 1 } });
        return { count: input.updatedCount ?? 1 };
      },
      findUniqueOrThrow: async () => {
        events.push('version');
        return { processingVersion: input.version ?? 1 };
      },
    },
    videoTranscodeOutbox: {
      create: async ({
        data,
      }: {
        data: { videoId: string; processingVersion: number; jobId: string };
      }) => {
        events.push('outbox');
        if (input.outboxError) throw new Error('DB insert failed');
        outboxRows.push(data);
        return data;
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, events, outboxRows };
}

test('staging checks original, uses CAS and persists matching outbox version', async () => {
  const fake = fakeTransaction({ version: 7 });
  const job = await stageTranscodingInTransaction(fake.tx, videoId);
  assert.deepEqual(job, { contractVersion: 1, videoId, processingVersion: 7 });
  assert.deepEqual(fake.events, ['original', 'cas', 'version', 'outbox']);
  assert.deepEqual(fake.outboxRows, [
    { videoId, processingVersion: 7, jobId: `transcode-${videoId}-7` },
  ]);
});

test('without verified original no transition or outbox row is made', async () => {
  const fake = fakeTransaction({ original: false });
  await assert.rejects(stageTranscodingInTransaction(fake.tx, videoId), /Verified original/);
  assert.deepEqual(fake.events, ['original']);
  assert.equal(fake.outboxRows.length, 0);
});

test('concurrent video update is rejected by CAS before staging the outbox row', async () => {
  const fake = fakeTransaction({ updatedCount: 0 });
  await assert.rejects(stageTranscodingInTransaction(fake.tx, videoId), /cannot be queued/);
  assert.deepEqual(fake.events, ['original', 'cas']);
  assert.equal(fake.outboxRows.length, 0);
});

test('outbox write failure propagates so the enclosing transaction can roll back', async () => {
  const fake = fakeTransaction({ outboxError: true });
  await assert.rejects(stageTranscodingInTransaction(fake.tx, videoId), /DB insert failed/);
});
