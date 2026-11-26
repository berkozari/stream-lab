/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorAnalyticsClient } from '../src/features/creator/services/creator-analytics-client.ts';

const response = {
  range: '7d' as const,
  asOf: '2026-11-26T12:00:00.000Z',
  rangeStart: '2026-11-19T12:00:00.000Z',
  qualifiedViews: 0,
  watchSeconds: 0,
  completedViews: 0,
  averageWatchSeconds: 0,
  completionRatePercent: 0,
  topVideos: [],
};

test('analytics client requests only an enumerated period and validates response', async () => {
  const http = {
    get: async (url: string) => {
      assert.equal(url, '/creator/analytics?range=7d');
      return { data: { success: true as const, data: response } };
    },
  };
  const client = createCreatorAnalyticsClient(http);
  assert.equal((await client.read('7d')).qualifiedViews, 0);
});
