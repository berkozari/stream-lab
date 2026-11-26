import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createVideoService } from '../../src/services/video.service.js';
import { createUpdateVideoService } from '../../src/services/video-update.service.js';
import { serializeVideo } from '../../src/services/video-read.service.js';

const videoId = randomUUID();
const ownerId = randomUUID();
const first = randomUUID();
const second = randomUUID();
const now = new Date('2026-11-26T10:00:00.000Z');
const base = {
  id: videoId,
  ownerId,
  title: 'Title',
  description: null,
  status: 'DRAFT' as const,
  visibility: 'PRIVATE' as const,
  durationSeconds: null,
  publishedAt: null,
  createdAt: now,
  updatedAt: now,
};

test('create response includes persisted category IDs', async () => {
  const handler = createVideoService(async () => ({
    ...base,
    categories: [{ categoryId: first }, { categoryId: second }],
  }));
  const created = await handler(ownerId, { title: 'Title', categoryIds: [first, second] });
  assert.deepEqual(created.categoryIds, [first, second]);
  assert.equal(created.ownerId, ownerId);
  assert.equal('storageKey' in created, false);
});

test('edit response exposes the new category set, not old associations', async () => {
  const handler = createUpdateVideoService(async () => ({
    ...base,
    categories: [{ categoryId: second }],
  }));
  const updated = await handler(videoId, ownerId, { categoryIds: [second] });
  assert.deepEqual(updated.categoryIds, [second]);
});

test('existing read-service test fixtures without relation info remain compatible', () => {
  const legacy = serializeVideo(base);
  assert.deepEqual(legacy.categoryIds, []);
});
