import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCreatorVideoAnalytics,
  fillUtcVideoAnalyticsDays,
} from '../../src/lib/creator-video-analytics.ts';

test('fills UTC day gaps in rolling 7-day window including both boundary dates', () => {
  const days = fillUtcVideoAnalyticsDays(
    new Date('2026-11-19T12:00:00.000Z'),
    new Date('2026-11-26T12:00:00.000Z'),
    [{ day: '2026-11-25', qualifiedViews: 2, watchSeconds: 18, completedViews: 1 }],
  );
  assert.equal(days.length, 8);
  assert.equal(days[0]?.day, '2026-11-19');
  assert.equal(days[6]?.qualifiedViews, 2);
  assert.equal(days[7]?.qualifiedViews, 0);
});

test('all-time never substitutes a misleading partial trend', () => {
  assert.deepEqual(fillUtcVideoAnalyticsDays(null, new Date(), []), []);
});

test('completion is bound by qualified views, and averages use qualified sessions', () => {
  assert.deepEqual(
    calculateCreatorVideoAnalytics({ qualifiedViews: 2, watchSeconds: 51, completedViews: 3 }),
    {
      qualifiedViews: 2,
      watchSeconds: 51,
      completedViews: 2,
      averageWatchSeconds: 26,
      completionRatePercent: 100,
    },
  );
});
