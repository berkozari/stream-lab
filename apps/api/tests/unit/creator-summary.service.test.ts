import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorSummaryService } from '../../src/services/creator-summary.service.js';

const ownerId = '2ef5e4c0-9a13-4a64-9d99-082ac51b1d80';

test('summary reader receives only the authenticated owner identity', async () => {
  let passedOwnerId: string | undefined;
  const summary = createCreatorSummaryService(async (id) => {
    passedOwnerId = id;
    return { statusCounts: [{ status: 'DRAFT', count: 2 }], publishedVideos: 0 };
  });
  const response = await summary(ownerId);
  assert.equal(passedOwnerId, ownerId);
  assert.equal(response.totalVideos, 2);
  assert.equal(response.draftVideos, 2);
  assert.equal(response.publishedVideos, 0);
});

test('invalid reader counts are rejected by the shared response schema', async () => {
  const summary = createCreatorSummaryService(async () => ({
    statusCounts: [{ status: 'READY', count: -1 }],
    publishedVideos: 0,
  }));
  await assert.rejects(() => summary(ownerId));
});
