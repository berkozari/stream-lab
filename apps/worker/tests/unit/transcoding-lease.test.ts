import assert from 'node:assert/strict';
import { test } from 'node:test';

// A live PostgreSQL instance is not needed: injected store implements the used queries.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@127.0.0.1:5432/streamlab_unit';
const {
  claimTranscodingLease,
  renewTranscodingLease,
  releaseTranscodingLease,
  TRANSCODING_LEASE_MS,
} = await import('../../src/repositories/transcoding-lease.repository.js');
import type { TranscodingLeaseStore } from '../../src/repositories/transcoding-lease.repository.js';

const job = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 4,
};
const now = new Date('2026-11-24T10:00:00.000Z');

type VideoRecord = {
  status: string;
  processingVersion: number;
  deletedAt: Date | null;
  processingLeaseToken: string | null;
  processingLeaseExpiresAt: Date | null;
};

type LeaseWhere = {
  id?: string;
  processingVersion?: number;
  deletedAt?: null;
  status?: string;
  processingLeaseToken?: string | null;
  processingLeaseExpiresAt?: { lte?: Date; gt?: Date } | null;
  OR?: LeaseWhere[];
};

type LeaseUpdate = Partial<
  Pick<VideoRecord, 'status' | 'processingLeaseToken' | 'processingLeaseExpiresAt'>
>;

function fixture(overrides: Partial<VideoRecord> = {}) {
  let row: VideoRecord = {
    status: 'QUEUED',
    processingVersion: 4,
    deletedAt: null,
    processingLeaseToken: null,
    processingLeaseExpiresAt: null,
    ...overrides,
  };
  const calls: Array<{ where: LeaseWhere; data: LeaseUpdate }> = [];
  const store = {
    video: {
      updateMany: async ({ where, data }: { where: LeaseWhere; data: LeaseUpdate }) => {
        calls.push({ where, data });
        const matches =
          where.id === job.videoId &&
          where.processingVersion === row.processingVersion &&
          row.deletedAt === null &&
          (where.status === undefined || where.status === row.status) &&
          (where.processingLeaseToken === undefined ||
            where.processingLeaseToken === row.processingLeaseToken) &&
          (where.OR === undefined ||
            where.OR.some(
              (branch) =>
                branch.status === row.status &&
                (branch.OR === undefined ||
                  branch.OR.some(
                    (condition) =>
                      'processingLeaseExpiresAt' in condition &&
                      (condition.processingLeaseExpiresAt === null
                        ? row.processingLeaseExpiresAt === null
                        : row.processingLeaseExpiresAt !== null &&
                          condition.processingLeaseExpiresAt?.lte !== undefined &&
                          row.processingLeaseExpiresAt <= condition.processingLeaseExpiresAt.lte),
                  )),
            )) &&
          (where.processingLeaseExpiresAt === undefined ||
            (row.processingLeaseExpiresAt !== null &&
              where.processingLeaseExpiresAt !== null &&
              where.processingLeaseExpiresAt.gt !== undefined &&
              row.processingLeaseExpiresAt > where.processingLeaseExpiresAt.gt));
        if (!matches) return { count: 0 };
        row = { ...row, ...data };
        return { count: 1 };
      },
      findUnique: async () => row,
    },
  } as unknown as TranscodingLeaseStore;
  return { store, calls, row: () => row };
}

test('claims QUEUED and token-fences an unexpired lease', async () => {
  const f = fixture();
  const result = await claimTranscodingLease(job, f.store, now);
  assert.equal(result.kind, 'claimed');
  if (result.kind !== 'claimed') return;
  assert.match(result.token, /^[0-9a-f-]{36}$/);
  assert.equal(result.expiresAt.getTime(), now.getTime() + TRANSCODING_LEASE_MS);
  assert.equal(f.row().status, 'PROCESSING');
  assert.equal(f.row().processingLeaseToken, result.token);
  assert.equal((await claimTranscodingLease(job, f.store, now)).kind, 'busy');
  assert.equal(
    await renewTranscodingLease(job, '00000000-0000-4000-8000-000000000000', f.store, now),
    false,
  );
  assert.equal(await renewTranscodingLease(job, result.token, f.store, now), true);
  assert.equal(await releaseTranscodingLease(job, result.token, 'retry', f.store, now), true);
  assert.equal(f.row().status, 'QUEUED');
  assert.equal(f.row().processingLeaseToken, null);
});

test('only expired PROCESSING lease may be reclaimed; old token cannot commit failure', async () => {
  const f = fixture({
    status: 'PROCESSING',
    processingLeaseToken: '00000000-0000-4000-8000-000000000001',
    processingLeaseExpiresAt: new Date(now.getTime() - 1),
  });
  const next = await claimTranscodingLease(job, f.store, now);
  assert.equal(next.kind, 'claimed');
  if (next.kind !== 'claimed') return;
  assert.equal(
    await releaseTranscodingLease(
      job,
      '00000000-0000-4000-8000-000000000001',
      'failed',
      f.store,
      now,
    ),
    false,
  );
  assert.equal(f.row().status, 'PROCESSING');
  assert.equal(await releaseTranscodingLease(job, next.token, 'failed', f.store, now), true);
  assert.equal(f.row().status, 'FAILED');
});

test('legacy PROCESSING row without lease can be reclaimed', async () => {
  const f = fixture({
    status: 'PROCESSING',
    processingLeaseToken: null,
    processingLeaseExpiresAt: null,
  });
  assert.equal((await claimTranscodingLease(job, f.store, now)).kind, 'claimed');
  assert.equal(f.row().status, 'PROCESSING');
  assert.ok(f.row().processingLeaseToken);
});

test('stale and deleted attempts never claim processing', async () => {
  for (const current of [
    { status: 'READY' },
    { status: 'FAILED' },
    { status: 'DELETING' },
    { processingVersion: 5 },
    { deletedAt: new Date(now) },
  ]) {
    const f = fixture(current);
    assert.deepEqual(await claimTranscodingLease(job, f.store, now), { kind: 'stale' });
    assert.equal(f.row().processingLeaseToken, null);
  }
});

test('unexpired PROCESSING reports BUSY with retryAt; expired ownership cannot renew/release', async () => {
  const expiresAt = new Date(now.getTime() + 1000);
  const token = '00000000-0000-4000-8000-000000000001';
  const f = fixture({
    status: 'PROCESSING',
    processingLeaseToken: token,
    processingLeaseExpiresAt: expiresAt,
  });
  assert.deepEqual(await claimTranscodingLease(job, f.store, now), {
    kind: 'busy',
    retryAt: expiresAt,
  });
  const later = new Date(now.getTime() + 1100);
  assert.equal(await renewTranscodingLease(job, token, f.store, later), false);
  assert.equal(await releaseTranscodingLease(job, token, 'retry', f.store, later), false);
});

test('bad payload rejects before touching storage', async () => {
  const f = fixture();
  await assert.rejects(
    claimTranscodingLease({ ...job, processingVersion: 0 }, f.store),
    /too_small|positive/i,
  );
  assert.equal(f.calls.length, 0);
});
