import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeCreatorVideos } from '../../src/lib/creator-summary-metrics.ts';

test('empty creator has zero metadata counts', () => {
  assert.deepEqual(summarizeCreatorVideos([], 0), {
    totalVideos: 0,
    draftVideos: 0,
    processingVideos: 0,
    readyVideos: 0,
    publishedVideos: 0,
    failedVideos: 0,
  });
});

test('video status groups do not treat published subset as another video', () => {
  const result = summarizeCreatorVideos(
    [
      { status: 'DRAFT', count: 2 },
      { status: 'UPLOADING', count: 1 },
      { status: 'UPLOADED', count: 1 },
      { status: 'QUEUED', count: 2 },
      { status: 'PROCESSING', count: 1 },
      { status: 'READY', count: 4 },
      { status: 'FAILED', count: 1 },
    ],
    3,
  );
  assert.deepEqual(result, {
    totalVideos: 12,
    draftVideos: 2,
    processingVideos: 5,
    readyVideos: 4,
    publishedVideos: 3,
    failedVideos: 1,
  });
});

test('a private ready video is counted as ready, not necessarily published', () => {
  const result = summarizeCreatorVideos([{ status: 'READY', count: 2 }], 1);
  assert.equal(result.readyVideos, 2);
  assert.equal(result.publishedVideos, 1);
  assert.equal(result.totalVideos, 2);
});
