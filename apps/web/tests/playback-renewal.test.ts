import assert from 'node:assert/strict';
import test from 'node:test';
import {
  playbackRefreshDue,
  playbackRefreshInterval,
} from '../src/features/playback/utils/playback-renewal.ts';

const now = Date.parse('2026-11-25T12:00:00Z');
const expiresIn = (ms: number) => new Date(now + ms).toISOString();

test('renews a 15-minute token before expiry without fast polling', () => {
  assert.equal(playbackRefreshInterval(expiresIn(900_000), now), 780_000);
  assert.equal(playbackRefreshDue(expiresIn(900_000), now), false);
  assert.equal(playbackRefreshDue(expiresIn(110_000), now), true);
});

test('short-lived links renew before expiry, never with a zero-delay loop', () => {
  assert.equal(playbackRefreshInterval(expiresIn(60_000), now), 45_000);
  assert.equal(playbackRefreshInterval(expiresIn(5_000), now), 2_500);
  assert.equal(playbackRefreshInterval(expiresIn(-1), now), 10_000);
});

test('missing or invalid expiry timestamps fail safely', () => {
  assert.equal(playbackRefreshInterval(undefined, now), false);
  assert.equal(playbackRefreshInterval('invalid', now), false);
  assert.equal(playbackRefreshDue(undefined, now), true);
  assert.equal(playbackRefreshDue('invalid', now), true);
});

test('background-tab return triggers refresh only near expiry', () => {
  assert.equal(playbackRefreshDue(expiresIn(130_000), now), false);
  assert.equal(playbackRefreshDue(expiresIn(120_000), now), true);
  assert.equal(playbackRefreshDue(expiresIn(-100), now), true);
});
