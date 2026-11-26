import assert from 'node:assert/strict';
import test from 'node:test';
import { planVideoPublication } from '../../src/lib/video-publication.ts';

const firstDate = new Date('2026-11-26T00:00:00.000Z');
const existingDate = new Date('2026-11-01T00:00:00.000Z');
const now = () => firstDate;

test('a READY private draft can be published for the first time', () => {
  assert.deepEqual(planVideoPublication({ status: 'READY', publishedAt: null }, 'PUBLIC', now), {
    exposing: true,
    allowed: true,
    publishedAt: firstDate,
  });
});

test('first unlisted publication also receives a publication date', () => {
  assert.deepEqual(planVideoPublication({ status: 'READY', publishedAt: null }, 'UNLISTED', now), {
    exposing: true,
    allowed: true,
    publishedAt: firstDate,
  });
});

test('processing or failed videos cannot become public', () => {
  for (const status of ['DRAFT', 'QUEUED', 'PROCESSING', 'FAILED', 'DELETING']) {
    assert.equal(planVideoPublication({ status, publishedAt: null }, 'PUBLIC', now).allowed, false);
  }
});

test('metadata edit or changing to PRIVATE never publishes a video', () => {
  for (const visibility of [undefined, 'PRIVATE'] as const) {
    const action = planVideoPublication({ status: 'READY', publishedAt: null }, visibility, now);
    assert.equal(action.allowed, true);
    assert.equal(action.exposing, false);
    assert.equal(action.publishedAt, undefined);
  }
});

test('republishing preserves the original publication timestamp', () => {
  const action = planVideoPublication(
    { status: 'READY', publishedAt: existingDate },
    'PUBLIC',
    now,
  );
  assert.equal(action.allowed, true);
  assert.equal(action.publishedAt, undefined);
});

test('private visibility remains editable even if transcode failed', () => {
  assert.deepEqual(planVideoPublication({ status: 'FAILED', publishedAt: null }, 'PRIVATE', now), {
    exposing: false,
    allowed: true,
  });
});
