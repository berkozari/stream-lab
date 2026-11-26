import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createWatchProgressService,
  type WatchStore,
  type ProgressRecord,
  type HistoryRecord,
} from '../../src/services/watch-progress.service.js';

const me = { userId: 'a14f6c8d-2e23-42eb-84dd-26d124d60ee8', role: 'USER' as const };
const other = { userId: '0b18af95-18a6-442a-9be1-f707d28f26e3', role: 'USER' as const };
const videoId = 'e84a9bee-6fa0-40f0-b93a-84462c164539';
const now = new Date('2026-11-26T08:00:00.000Z');

function fixture() {
  const stored = new Map<string, ProgressRecord>();
  let eligible = true;
  const calls: Array<{
    userId: string;
    videoId: string;
    positionSeconds: number;
    completedAt: Date | null;
  }> = [];
  const store: WatchStore = {
    eligibleVideo: async () => (eligible ? { id: videoId, durationSeconds: 100 } : null),
    read: async (userId, id) => stored.get(`${userId}:${id}`) ?? null,
    save: async (userId, id, seconds, completedAt, lastWatchedAt) => {
      calls.push({ userId, videoId: id, positionSeconds: seconds, completedAt });
      const row = { videoId: id, positionSeconds: seconds, completedAt, lastWatchedAt };
      stored.set(`${userId}:${id}`, row);
      return row;
    },
    list: async ({ viewer, limit, cursor, mode }) => {
      const rows: HistoryRecord[] = Array.from({ length: 4 }, (_, i) => ({
        videoId: `e84a9bee-6fa0-40f0-b93a-84462c16453${i}`,
        positionSeconds: 20,
        completedAt: null,
        lastWatchedAt: new Date(now.getTime() - i * 1000),
        video: {
          id: `e84a9bee-6fa0-40f0-b93a-84462c16453${i}`,
          title: `Video ${i}`,
          durationSeconds: 100,
          visibility: 'PUBLIC',
        },
      }));
      assert.equal(viewer.userId, me.userId);
      assert.equal(mode === 'history' || mode === 'continue', true);
      const following = cursor
        ? rows.filter(
            (row) =>
              row.lastWatchedAt < cursor.lastWatchedAt ||
              (row.lastWatchedAt.getTime() === cursor.lastWatchedAt.getTime() &&
                row.videoId < cursor.videoId),
          )
        : rows;
      return following.slice(0, limit + 1);
    },
  };
  return {
    service: createWatchProgressService(store, () => now),
    stored,
    calls,
    deny: () => {
      eligible = false;
    },
  };
}

test('progress stored under JWT user identity; positions clamped to known duration', async () => {
  const { service, calls } = fixture();
  const saved = await service.save(videoId, me, { positionSeconds: 400 });
  assert.equal(saved.positionSeconds, 100);
  assert.equal(saved.completedAt, now.toISOString());
  assert.deepEqual(
    calls.map((c) => c.userId),
    [me.userId],
  );
  assert.equal((await service.get(videoId, me))?.positionSeconds, 100);
  assert.equal(await service.get(videoId, other), null);
});

test('replay below threshold clears completedAt; explicit completion works', async () => {
  const { service } = fixture();
  await service.save(videoId, me, { positionSeconds: 95 });
  const restart = await service.save(videoId, me, { positionSeconds: 12 });
  assert.equal(restart.completedAt, null);
  assert.equal(
    (await service.save(videoId, me, { positionSeconds: 20, completed: true })).completedAt,
    now.toISOString(),
  );
});

test('noneligible video is 404 and never saved or exposed', async () => {
  const { service, deny, calls } = fixture();
  deny();
  await assert.rejects(service.save(videoId, me, { positionSeconds: 23 }), (e: unknown) =>
    Boolean(e && typeof e === 'object' && 'statusCode' in e && e.statusCode === 404),
  );
  await assert.rejects(service.get(videoId, me), (e: unknown) =>
    Boolean(e && typeof e === 'object' && 'statusCode' in e && e.statusCode === 404),
  );
  assert.equal(calls.length, 0);
});

test('history uses viewer-scoped deterministic cursor; continue cursor cannot be reused', async () => {
  const { service } = fixture();
  const first = await service.list(me, 'history', { limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  const next = await service.list(me, 'history', { limit: 2, cursor: first.nextCursor! });
  assert.equal(next.items.length, 2);
  assert.notEqual(first.items[0]?.videoId, next.items[0]?.videoId);
  await assert.rejects(service.list(me, 'continue', { limit: 2, cursor: first.nextCursor! }), {
    code: 'INVALID_CURSOR',
  });
  await assert.rejects(service.list(other, 'history', { limit: 2, cursor: first.nextCursor! }), {
    code: 'INVALID_CURSOR',
  });
  await assert.rejects(service.list(me, 'history', { limit: 2, cursor: 'broken' }), {
    code: 'INVALID_CURSOR',
  });
});
