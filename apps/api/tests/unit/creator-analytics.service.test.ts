/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCreatorAnalyticsService } from '../../src/services/creator-analytics.service.js';

const ownerId = 'e1e926fb-ae15-4a6c-89b8-6af25d33a69c';
const otherId = '602989aa-6ce7-4cc0-86b9-72f4aec4c7c3';
const videoId = '24d53890-15d4-4873-8858-34513875baef';

test('aggregates only the authenticated creator and applies the requested window', async () => {
  const calls: string[] = [];
  const service = createCreatorAnalyticsService(
    {
      qualified: async (owner, since) => {
        assert.equal(owner, ownerId);
        assert.equal(since?.toISOString(), '2026-11-19T12:00:00.000Z');
        calls.push('qualified');
        return [{ videoId, _count: { _all: 2 }, _sum: { watchedSeconds: 50 } }];
      },
      completed: async (owner) => {
        assert.equal(owner, ownerId);
        calls.push('completed');
        return [{ videoId, _count: { _all: 1 } }];
      },
      titles: async (owner, ids) => {
        assert.equal(owner, ownerId);
        assert.deepEqual(ids, [videoId]);
        calls.push('titles');
        return [{ id: videoId, title: 'Test video' }];
      },
    },
    () => new Date('2026-11-26T12:00:00.000Z'),
  );
  const result = await service(ownerId, '7d');
  assert.equal(result.qualifiedViews, 2);
  assert.equal(result.watchSeconds, 50);
  assert.equal(result.completionRatePercent, 50);
  assert.equal(result.topVideos[0]?.title, 'Test video');
  assert.deepEqual(calls.sort(), ['completed', 'qualified', 'titles']);
});

test('deleted or unauthorized video metadata is omitted from the top-video list', async () => {
  const service = createCreatorAnalyticsService({
    qualified: async () => [{ videoId, _count: { _all: 1 }, _sum: { watchedSeconds: 10 } }],
    completed: async () => [],
    titles: async (owner, ids) => {
      assert.equal(owner, otherId);
      assert.deepEqual(ids, [videoId]);
      return [];
    },
  });
  const result = await service(otherId, 'all');
  assert.equal(result.qualifiedViews, 1);
  assert.deepEqual(result.topVideos, []);
});
