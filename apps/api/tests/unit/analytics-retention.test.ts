import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyticsRetentionCutoff,
  mergeCompletedArchive,
  mergeQualifiedArchive,
  parseBoundedInteger,
  safeAnalyticsNumber,
} from '../../src/lib/analytics-retention.js';

const videoA = '0bc1899c-9bfa-433f-b688-f9691e0f7862';
const videoB = '719d65a7-5457-4d72-b5e7-06060f23bde5';

test('retention cutoff stays beyond 7d / 30d query ranges', () => {
  assert.equal(
    analyticsRetentionCutoff(new Date('2026-11-27T12:00:00Z'), 120).toISOString(),
    '2026-07-30T12:00:00.000Z',
  );
  assert.throws(() => analyticsRetentionCutoff(new Date(), 30), /60-3650/);
  assert.throws(() => analyticsRetentionCutoff(new Date('invalid'), 120), /clock/);
});

test('CLI numeric options reject fractions, zero, whitespace and unsafe numbers', () => {
  assert.equal(parseBoundedInteger('500', '--batch-size', 1, 1000), 500);
  for (const value of ['0', '-1', '1.5', ' 500', '1001', '9007199254740993', '0x10']) {
    assert.throws(() => parseBoundedInteger(value, '--batch-size', 1, 1000));
  }
});

test('all-time rollup adds historical qualified counts to active rows', () => {
  const active = [{ videoId: videoA, _count: { _all: 2 }, _sum: { watchedSeconds: 30 } }];
  const archive = [
    { videoId: videoA, qualifiedViews: 3n, watchSeconds: 100n, completedViews: 1n },
    { videoId: videoB, qualifiedViews: 4n, watchSeconds: 80n, completedViews: 3n },
  ];
  assert.deepEqual(mergeQualifiedArchive(active, archive), [
    { videoId: videoA, _count: { _all: 5 }, _sum: { watchedSeconds: 130 } },
    { videoId: videoB, _count: { _all: 4 }, _sum: { watchedSeconds: 80 } },
  ]);
  assert.equal(active[0]._count._all, 2, 'does not mutate Prisma results');
  assert.deepEqual(mergeCompletedArchive([{ videoId: videoA, _count: { _all: 1 } }], archive), [
    { videoId: videoA, _count: { _all: 2 } },
    { videoId: videoB, _count: { _all: 3 } },
  ]);
});

test('archive with no active sessions is still represented in all-time totals', () => {
  const result = mergeQualifiedArchive(
    [],
    [{ videoId: videoA, qualifiedViews: 8n, watchSeconds: 120n, completedViews: 2n }],
  );
  assert.equal(result[0]?._count._all, 8);
});

test('very large archive values fail rather than silently lose integer precision', () => {
  assert.throws(() => safeAnalyticsNumber(9_007_199_254_740_992n), /safe numeric/);
  assert.throws(() => safeAnalyticsNumber(-1n), /safe numeric/);
});
