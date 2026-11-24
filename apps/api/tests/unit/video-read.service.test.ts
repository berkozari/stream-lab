import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { VideoListQuerySchema } from '@streamlab/contracts';
import { decodeVideoCursor } from '../../src/lib/video-cursor.js';
import {
  createVideoDetailService,
  createVideoListService,
  type VideoPageReader,
} from '../../src/services/video-read.service.js';
import type { VideoReadRecord } from '../../src/repositories/video-read.repository.js';

const ownerId = randomUUID();
const otherId = randomUUID();
const ids = [randomUUID(), randomUUID(), randomUUID()];
const createdAt = new Date('2026-11-24T08:00:00.000Z');
const makeRow = (overrides: Partial<VideoReadRecord> = {}): VideoReadRecord => ({
  id: ids[0]!,
  ownerId,
  title: 'Video title',
  description: null,
  status: 'DRAFT',
  visibility: 'PRIVATE',
  durationSeconds: null,
  publishedAt: null,
  createdAt,
  updatedAt: createdAt,
  ...overrides,
});

test('keyset pagination returns an opaque scoped cursor and strips internal fields', async () => {
  const captured: { cursorId?: string; scope?: string; userId?: string } = {};
  const readPage: VideoPageReader = async (filter) => {
    captured.cursorId = filter.cursor?.id;
    captured.scope = filter.scope;
    captured.userId = filter.userId;
    return [makeRow({ id: ids[0]! }), makeRow({ id: ids[1]! }), makeRow({ id: ids[2]! })];
  };
  const handler = createVideoListService(readPage);
  const first = await handler({
    scope: 'mine',
    userId: ownerId,
    query: VideoListQuerySchema.parse({ limit: 2, q: '  title  ' }),
  });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  assert.equal(captured.scope, 'mine');
  assert.equal(captured.userId, ownerId);
  assert.equal(first.items[0]?.id, ids[0]);
  assert.ok(!('processingVersion' in first.items[0]!));
  assert.ok(!('deletedAt' in first.items[0]!));
  const next = await handler({
    scope: 'mine',
    userId: ownerId,
    query: VideoListQuerySchema.parse({ limit: 2, q: 'title', cursor: first.nextCursor }),
  });
  assert.equal(next.items.length, 2);
  assert.equal(captured.cursorId, ids[1]);
  await assert.rejects(
    () =>
      handler({
        scope: 'mine',
        userId: otherId,
        query: VideoListQuerySchema.parse({ limit: 2, q: 'title', cursor: first.nextCursor }),
      }),
    { statusCode: 422 },
  );
  await assert.rejects(
    () =>
      handler({
        scope: 'public',
        query: VideoListQuerySchema.parse({ limit: 2, q: 'title', cursor: first.nextCursor }),
      }),
    { statusCode: 422 },
  );
  assert.throws(() => decodeVideoCursor('not-valid', { scope: 'public' }));
});

test('detail allows owner/admin or published READY PUBLIC/UNLISTED; hides private and draft', async () => {
  const privateDraft = makeRow();
  const privateDetail = createVideoDetailService(async () => privateDraft);
  assert.equal(
    (await privateDetail(privateDraft.id, { userId: ownerId, role: 'USER' })).id,
    privateDraft.id,
  );
  assert.equal(
    (await privateDetail(privateDraft.id, { userId: otherId, role: 'ADMIN' })).id,
    privateDraft.id,
  );
  await assert.rejects(() => privateDetail(privateDraft.id), { statusCode: 404 });
  await assert.rejects(() => privateDetail(privateDraft.id, { userId: otherId, role: 'USER' }), {
    statusCode: 404,
  });
  const publishedAt = new Date('2026-11-24T08:01:00.000Z');
  for (const visibility of ['UNLISTED', 'PUBLIC'] as const) {
    const detail = createVideoDetailService(async () =>
      makeRow({ status: 'READY', visibility, publishedAt }),
    );
    assert.equal((await detail(ids[0]!)).visibility, visibility);
  }
  const unpublished = createVideoDetailService(async () =>
    makeRow({ status: 'READY', visibility: 'PUBLIC', publishedAt: null }),
  );
  await assert.rejects(() => unpublished(ids[0]!), { statusCode: 404 });
  const missing = createVideoDetailService(async () => null);
  await assert.rejects(() => missing(ids[0]!), { statusCode: 404 });
});
