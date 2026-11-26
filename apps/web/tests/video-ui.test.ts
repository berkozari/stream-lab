import assert from 'node:assert/strict';
import test from 'node:test';
import type { Video } from '@streamlab/contracts';
import {
  canChangeVideoVisibility,
  validateVideoMetadata,
  videoRequestError,
  VIDEO_STATUS_LABELS,
  VIDEO_VISIBILITY_LABELS,
} from '../src/features/videos/utils/video-ui.utils.ts';

const video = {
  status: 'DRAFT',
  visibility: 'PRIVATE',
  publishedAt: null,
} as Video;

test('metadata uses shared Zod contract; sanitizes title and handles empty description', () => {
  const result = validateVideoMetadata({ title: '  Demo video  ', description: '   ' });
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.equal(result.data.title, 'Demo video');
  assert.equal(result.data.description, null);
  assert.deepEqual(result.data.categoryIds, []);
});

test('invalid video metadata rejects blank or too long title and oversized description', () => {
  const missing = validateVideoMetadata({ title: '   ', description: '' });
  assert.equal(missing.success, false);
  if (!missing.success) assert.ok(missing.errors.title);
  const long = validateVideoMetadata({ title: 'x'.repeat(161), description: '' });
  assert.equal(long.success, false);
  const description = validateVideoMetadata({ title: 'ok', description: 'x'.repeat(10_001) });
  assert.equal(description.success, false);
  if (!description.success) assert.ok(description.errors.description);
});

test('visibility edits require READY status, including first publication', () => {
  assert.equal(canChangeVideoVisibility(video), false);
  assert.equal(canChangeVideoVisibility({ ...video, status: 'READY' }), true);
  assert.equal(
    canChangeVideoVisibility({
      ...video,
      status: 'READY',
      publishedAt: '2026-11-20T00:00:00.000Z',
    }),
    true,
  );
  assert.equal(
    canChangeVideoVisibility({
      ...video,
      status: 'FAILED',
      publishedAt: '2026-11-20T00:00:00.000Z',
    }),
    false,
  );
});

test('error messages are safe for user and status labels cover enum variants', () => {
  assert.match(videoRequestError({ response: { status: 409 } }), /hazır/u);
  assert.match(videoRequestError({ response: { status: 401 } }), /Oturumunuzun/u);
  assert.match(videoRequestError({ response: { status: 422 } }), /geçersiz/u);
  assert.match(videoRequestError(new Error('SECRET_DATABASE_URL')), /İşlem tamamlanamadı/u);
  assert.equal(VIDEO_STATUS_LABELS.DRAFT, 'Taslak');
  assert.equal(VIDEO_VISIBILITY_LABELS.UNLISTED, 'Liste dışı');
});
