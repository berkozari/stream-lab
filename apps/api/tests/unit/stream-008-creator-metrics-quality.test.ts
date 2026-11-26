import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rankCreatorAnalytics,
  creatorAnalyticsStart,
} from '../../src/lib/creator-analytics-metrics.ts';
import {
  calculateCreatorVideoAnalytics,
  fillUtcVideoAnalyticsDays,
} from '../../src/lib/creator-video-analytics.ts';

const videoA = '11111111-1111-4111-8111-111111111111';
const videoB = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-11-26T12:30:00.000Z');

test('empty analytics does not invent views, watch time or top videos', () => {
  const totals = rankCreatorAnalytics([], []);
  assert.equal(totals.qualifiedViews, 0);
  assert.equal(totals.watchSeconds, 0);
  assert.equal(totals.completedViews, 0);
  assert.equal(totals.completionRatePercent, 0);
  assert.deepEqual(totals.topVideos, []);
});

test('unqualified completion rows do not increase completed view totals', () => {
  const totals = rankCreatorAnalytics(
    [{ videoId: videoA, _count: { _all: 2 }, _sum: { watchedSeconds: 38 } }],
    [
      { videoId: videoA, _count: { _all: 1 } },
      { videoId: videoB, _count: { _all: 20 } },
    ],
  );
  assert.equal(totals.qualifiedViews, 2);
  assert.equal(totals.completedViews, 1);
  assert.equal(totals.completionRatePercent, 50);
});

test('completion rate cannot exceed 100 percent even with inconsistent rows', () => {
  const totals = rankCreatorAnalytics(
    [{ videoId: videoA, _count: { _all: 2 }, _sum: { watchedSeconds: 24 } }],
    [{ videoId: videoA, _count: { _all: 7 } }],
  );
  assert.equal(totals.completedViews, 2);
  assert.equal(totals.completionRatePercent, 100);
});

test('null aggregate sum results in zero watch seconds', () => {
  const totals = rankCreatorAnalytics(
    [{ videoId: videoA, _count: { _all: 1 }, _sum: { watchedSeconds: null } }],
    [],
  );
  assert.equal(totals.watchSeconds, 0);
  assert.equal(totals.averageWatchSeconds, 0);
});

test('top video tie-breakers are stable across equivalent metrics', () => {
  const totals = rankCreatorAnalytics(
    [
      { videoId: videoB, _count: { _all: 2 }, _sum: { watchedSeconds: 20 } },
      { videoId: videoA, _count: { _all: 2 }, _sum: { watchedSeconds: 20 } },
    ],
    [],
  );
  assert.deepEqual(
    totals.topVideos.map((v) => v.videoId),
    [videoA, videoB],
  );
});

test('UTC windows are rolling ranges and all-time has no lower bound', () => {
  assert.equal(creatorAnalyticsStart('7d', now)?.toISOString(), '2026-11-19T12:30:00.000Z');
  assert.equal(creatorAnalyticsStart('30d', now)?.toISOString(), '2026-10-27T12:30:00.000Z');
  assert.equal(creatorAnalyticsStart('all', now), null);
});

test('daily chart uses UTC calendar boundaries with zero-filled missing dates', () => {
  const result = fillUtcVideoAnalyticsDays(
    new Date('2026-11-25T12:30:00.000Z'),
    new Date('2026-11-26T12:30:00.000Z'),
    [{ day: '2026-11-26', qualifiedViews: 2, watchSeconds: 25, completedViews: 1 }],
  );
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((day) => day.qualifiedViews),
    [0, 2],
  );
  assert.deepEqual(
    result.map((day) => day.day),
    ['2026-11-25', '2026-11-26'],
  );
});

test('all-time analytics does not fabricate a partial daily timeline', () => {
  assert.deepEqual(fillUtcVideoAnalyticsDays(null, now, []), []);
});

test('video metrics clamp contradictory completion counts and calculate mean per view', () => {
  const result = calculateCreatorVideoAnalytics({
    qualifiedViews: 2,
    completedViews: 5,
    watchSeconds: 51,
  });
  assert.equal(result.qualifiedViews, 2);
  assert.equal(result.completedViews, 2);
  assert.equal(result.averageWatchSeconds, 26);
  assert.equal(result.completionRatePercent, 100);
});
