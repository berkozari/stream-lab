import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorVideoAnalyticsClient } from '../src/features/creator/services/creator-video-analytics-client.ts';

const videoId = '1b79dc79-5101-4a4d-ab26-c9d7562fd61e';
const response = {
  videoId,
  title: 'Example',
  range: 'all' as const,
  asOf: '2026-11-26T12:00:00.000Z',
  rangeStart: null,
  qualifiedViews: 0,
  watchSeconds: 0,
  completedViews: 0,
  averageWatchSeconds: 0,
  completionRatePercent: 0,
  daily: [],
};
test('details client validates schema and encodes video id with range', async () => {
  const client = createCreatorVideoAnalyticsClient({
    get: async (url) => {
      assert.equal(url, `/creator/videos/${videoId}/analytics?range=all`);
      return { data: { success: true, data: response } };
    },
  });
  assert.equal((await client.read(videoId, 'all')).qualifiedViews, 0);
});
