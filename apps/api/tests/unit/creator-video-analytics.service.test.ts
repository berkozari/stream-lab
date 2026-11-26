import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorVideoAnalyticsService } from '../../src/services/creator-video-analytics.service.js';

const owner = '0dd80c58-1598-4d0a-a92c-8cf2011d89f1';
const video = '1b79dc79-5101-4a4d-ab26-c9d7562fd61e';

test('video details are owner scoped and never return raw viewer sessions', async () => {
  let calls = 0;
  const handler = createCreatorVideoAnalyticsService(
    {
      video: async (user, id) => {
        assert.equal(user, owner);
        assert.equal(id, video);
        return { id, title: 'Video' };
      },
      totals: async (user, id, since) => {
        assert.equal(user, owner);
        assert.equal(id, video);
        assert.equal(since?.toISOString(), '2026-11-19T12:00:00.000Z');
        calls++;
        return { qualifiedViews: 2, watchSeconds: 51, completedViews: 1 };
      },
      days: async (user, id) => {
        assert.equal(user, owner);
        assert.equal(id, video);
        calls++;
        return [{ day: '2026-11-26', qualifiedViews: 2, watchSeconds: 51, completedViews: 1 }];
      },
    },
    () => new Date('2026-11-26T12:00:00.000Z'),
  );
  const result = await handler(owner, video, '7d');
  assert.equal(calls, 2);
  assert.equal(result.daily.length, 8);
  assert.equal(result.completionRatePercent, 50);
  assert.equal('viewerId' in result, false);
});

test('foreign/missing videos are 404 and do not trigger aggregate reads', async () => {
  const handler = createCreatorVideoAnalyticsService({
    video: async () => null,
    totals: async () => {
      throw new Error('must not query');
    },
    days: async () => {
      throw new Error('must not query');
    },
  });
  await assert.rejects(
    () => handler(owner, video, 'all'),
    (e: unknown) => e instanceof Error && 'statusCode' in e && e.statusCode === 404,
  );
});

test('all-time analytics returns aggregates, not a truncated time series', async () => {
  const handler = createCreatorVideoAnalyticsService({
    video: async () => ({ id: video, title: 'Video' }),
    totals: async (_owner, _video, since) => {
      assert.equal(since, null);
      return { qualifiedViews: 0, watchSeconds: 0, completedViews: 0 };
    },
    days: async () => {
      throw new Error('all time should not query daily');
    },
  });
  const result = await handler(owner, video, 'all');
  assert.equal(result.qualifiedViews, 0);
  assert.deepEqual(result.daily, []);
});
