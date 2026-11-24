import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CreateVideoRequestSchema,
  CreateUploadRequestSchema,
  ErrorResponseSchema,
  RegisterRequestSchema,
  LoginRequestSchema,
  PageQuerySchema,
  VideoResponseSchema,
  PlaybackResponseSchema,
  SizeBytesSchema,
  WatchProgressRequestSchema,
} from '../dist/index.js';

const uid = '123e4567-e89b-42d3-a456-426614174000';
const date = '2026-11-23T09:00:00.000Z';

test('register and login inputs reject malformed credentials', () => {
  assert.equal(
    RegisterRequestSchema.safeParse({ email: 'bad', password: 'short', displayName: 'A' }).success,
    false,
  );
  assert.equal(
    LoginRequestSchema.safeParse({ email: 'a@example.com', password: 'strong-password' }).success,
    true,
  );
});

test('video create request can default categories and rejects empty titles', () => {
  assert.deepEqual(CreateVideoRequestSchema.parse({ title: 'Example' }).categoryIds, []);
  assert.equal(CreateVideoRequestSchema.safeParse({ title: '   ' }).success, false);
});

test('public API video response is independent from Prisma storage keys', () => {
  const dto = {
    id: uid,
    ownerId: uid,
    title: 'Example',
    description: null,
    status: 'READY',
    visibility: 'PUBLIC',
    durationSeconds: 40,
    publishedAt: date,
    createdAt: date,
    updatedAt: date,
  };
  assert.equal(VideoResponseSchema.safeParse(dto).success, true);
  assert.equal(VideoResponseSchema.safeParse({ ...dto, status: 'PUBLISHED' }).success, false);
});

test('upload size uses a JSON-safe decimal string', () => {
  assert.equal(SizeBytesSchema.safeParse('1099511627776').success, true);
  assert.equal(
    CreateUploadRequestSchema.safeParse({
      fileName: 'example.mp4',
      contentType: 'video/mp4',
      sizeBytes: '2147483648',
    }).success,
    true,
  );
  assert.equal(SizeBytesSchema.safeParse(1000).success, false);
  assert.equal(SizeBytesSchema.safeParse('0').success, false);
});

test('playback URL and watch progress inputs have constraints', () => {
  assert.equal(
    PlaybackResponseSchema.safeParse({
      videoId: uid,
      protocol: 'HLS',
      manifestUrl: 'https://example.com/hls/master.m3u8',
      expiresAt: date,
    }).success,
    true,
  );
  assert.equal(WatchProgressRequestSchema.safeParse({ positionSeconds: -1 }).success, false);
});

test('shared envelope and pagination follow expected wire format', () => {
  assert.equal(
    ErrorResponseSchema.safeParse({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request' },
      requestId: null,
    }).success,
    true,
  );
  assert.equal(PageQuerySchema.parse({}).limit, 20);
  assert.equal(PageQuerySchema.safeParse({ limit: 1000 }).success, false);
});
