/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankCreatorAnalytics,
  completionPercent,
  creatorAnalyticsStart,
} from '../../src/lib/creator-analytics-metrics.ts';

const idA = '11111111-1111-4111-8111-111111111111';
const idB = '22222222-2222-4222-8222-222222222222';

test('empty sessions yield zero metrics and no top videos', () => {
  const result = rankCreatorAnalytics([], []);
  assert.equal(result.qualifiedViews, 0);
  assert.equal(result.averageWatchSeconds, 0);
  assert.equal(result.completionRatePercent, 0);
  assert.deepEqual(result.topVideos, []);
});

test('qualified sessions aggregate watch time and completed events correctly', () => {
  const result = rankCreatorAnalytics(
    [
      { videoId: idA, _count: { _all: 2 }, _sum: { watchedSeconds: 90 } },
      { videoId: idB, _count: { _all: 3 }, _sum: { watchedSeconds: 150 } },
    ],
    [
      { videoId: idA, _count: { _all: 1 } },
      { videoId: idB, _count: { _all: 2 } },
    ],
  );
  assert.equal(result.qualifiedViews, 5);
  assert.equal(result.watchSeconds, 240);
  assert.equal(result.completedViews, 3);
  assert.equal(result.averageWatchSeconds, 48);
  assert.equal(result.completionRatePercent, 60);
  assert.equal(result.topVideos[0]?.videoId, idB);
});

test('completion rate is bounded and rounded to one decimal place', () => {
  assert.equal(completionPercent(2, 3), 66.7);
  assert.equal(completionPercent(7, 2), 100);
  assert.equal(completionPercent(0, 0), 0);
});

test('top videos are limited to five and ties are deterministic', () => {
  const rows = Array.from({ length: 7 }, (_, n) => ({
    videoId: `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`,
    _count: { _all: 1 },
    _sum: { watchedSeconds: null },
  })).reverse();
  const result = rankCreatorAnalytics(rows, []);
  assert.equal(result.topVideos.length, 5);
  assert.ok(result.topVideos[0]!.videoId < result.topVideos[1]!.videoId);
});

test('7d and 30d time ranges are rolling UTC windows; all has no start', () => {
  const now = new Date('2026-11-26T12:00:00.000Z');
  assert.equal(creatorAnalyticsStart('7d', now)?.toISOString(), '2026-11-19T12:00:00.000Z');
  assert.equal(creatorAnalyticsStart('30d', now)?.toISOString(), '2026-10-27T12:00:00.000Z');
  assert.equal(creatorAnalyticsStart('all', now), null);
});
