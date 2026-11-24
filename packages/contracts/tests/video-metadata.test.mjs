import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CreateVideoRequestSchema,
  UpdateVideoRequestSchema,
  VideoListQuerySchema,
  VideoResponseSchema,
  VideoStatusSchema,
  VideoVisibilitySchema,
} from '../dist/index.js';

const first = '123e4567-e89b-42d3-a456-426614174000';
const second = '123e4567-e89b-42d3-a456-426614174001';
const timestamp = '2026-11-24T06:00:00.000Z';

test('create defaults to empty categories and normalizes title', () => {
  assert.deepEqual(CreateVideoRequestSchema.parse({ title: '  My first video  ' }), {
    title: 'My first video',
    categoryIds: [],
  });
  assert.deepEqual(CreateVideoRequestSchema.parse({ title: 'Draft', description: null }), {
    title: 'Draft',
    description: null,
    categoryIds: [],
  });
  assert.equal(CreateVideoRequestSchema.safeParse({ title: 'x'.repeat(160) }).success, true);
  assert.equal(CreateVideoRequestSchema.safeParse({ title: 'x'.repeat(161) }).success, false);
  assert.equal(CreateVideoRequestSchema.safeParse({ title: '   ' }).success, false);
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', description: 'd'.repeat(10001) }).success,
    false,
  );
});

test('create and update reject mass assignment and invalid categories', () => {
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', ownerId: first }).success,
    false,
  );
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', status: 'READY' }).success,
    false,
  );
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', publishedAt: timestamp }).success,
    false,
  );
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', visibility: 'PUBLIC' }).success,
    false,
  );
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', categoryIds: [first, first] }).success,
    false,
  );
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Draft', categoryIds: ['not-a-uuid'] }).success,
    false,
  );
  assert.equal(
    CreateVideoRequestSchema.safeParse({
      title: 'Draft',
      categoryIds: Array.from(
        { length: 11 },
        (_, i) => `123e4567-e89b-42d3-a456-${String(426614174000 + i).padStart(12, '0')}`,
      ),
    }).success,
    false,
  );
  assert.deepEqual(
    CreateVideoRequestSchema.parse({ title: 'Draft', categoryIds: [first, second] }).categoryIds,
    [first, second],
  );
});

test('update needs at least one supported field, without implicit defaults', () => {
  assert.equal(UpdateVideoRequestSchema.safeParse({}).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ ownerId: first }).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ deletedAt: timestamp }).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ processingVersion: 99 }).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ status: 'READY' }).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ title: '  ' }).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ visibility: 'VISIBLE' }).success, false);
  assert.equal(UpdateVideoRequestSchema.safeParse({ categoryIds: [first, first] }).success, false);
  assert.deepEqual(UpdateVideoRequestSchema.parse({ title: '  Updated  ' }), { title: 'Updated' });
  assert.deepEqual(UpdateVideoRequestSchema.parse({ description: null }), { description: null });
  assert.deepEqual(UpdateVideoRequestSchema.parse({ categoryIds: [] }), { categoryIds: [] });
  assert.deepEqual(UpdateVideoRequestSchema.parse({ visibility: 'PRIVATE' }), {
    visibility: 'PRIVATE',
  });
});

test('list query validates pagination and trims search/category terms', () => {
  assert.deepEqual(VideoListQuerySchema.parse({}), { limit: 20 });
  assert.deepEqual(
    VideoListQuerySchema.parse({ limit: '25', q: '  wildlife  ', category: '  nature  ' }),
    {
      limit: 25,
      q: 'wildlife',
      category: 'nature',
    },
  );
  assert.equal(VideoListQuerySchema.safeParse({ q: '   ' }).success, false);
  assert.equal(VideoListQuerySchema.safeParse({ category: '   ' }).success, false);
  assert.equal(VideoListQuerySchema.safeParse({ limit: '51' }).success, false);
  assert.equal(VideoListQuerySchema.safeParse({ limit: '-1' }).success, false);
  assert.equal(VideoListQuerySchema.safeParse({ cursor: '' }).success, false);
});

test('video DTO only exposes public metadata and validates known enum values', () => {
  const dto = {
    id: first,
    ownerId: second,
    title: 'Video',
    description: null,
    status: 'READY',
    visibility: 'PUBLIC',
    durationSeconds: 42,
    publishedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    storageKey: 'private/secret/master.m3u8',
    deletedAt: null,
    processingVersion: 0,
  };
  const result = VideoResponseSchema.parse(dto);
  assert.ok(!Object.hasOwn(result, 'storageKey'));
  assert.ok(!Object.hasOwn(result, 'deletedAt'));
  assert.ok(!Object.hasOwn(result, 'processingVersion'));
  assert.equal(VideoResponseSchema.safeParse({ ...dto, status: 'PUBLISHED' }).success, false);
  assert.equal(
    VideoResponseSchema.safeParse({ ...dto, publishedAt: 'invalid-date' }).success,
    false,
  );
  assert.equal(VideoStatusSchema.options.includes('DELETING'), true);
  assert.equal(VideoVisibilitySchema.options.includes('UNLISTED'), true);
});
