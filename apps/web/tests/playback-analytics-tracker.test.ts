import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPlaybackAnalyticsTracker } from '../src/features/playback/utils/playback-analytics-tracker.ts';

function media() {
  return {
    currentTime: 0,
    playbackRate: 1,
    readyState: 4,
    paused: false,
    seeking: false,
    ended: false,
  };
}

test('START does not count loading or page opening as a view', () => {
  const now = 0;
  const events: Array<{ kind: string; playedSeconds: number }> = [];
  const tracker = createPlaybackAnalyticsTracker(
    (event) => events.push(event),
    () => now,
  );
  const video = media();
  tracker.playing(video);
  assert.deepEqual(
    events.map((event) => event.kind),
    ['START'],
  );
  assert.equal(events[0]?.playedSeconds, 0);
});

test('real forward playback produces a bounded heartbeat; a seek does not earn watched seconds', () => {
  let now = 0;
  const events: Array<{ kind: string; playedSeconds: number; positionSeconds: number }> = [];
  const tracker = createPlaybackAnalyticsTracker(
    (event) => events.push(event),
    () => now,
  );
  const video = media();
  tracker.playing(video);
  now += 5_000;
  video.currentTime = 5;
  tracker.timeupdate(video);
  tracker.heartbeat(video);
  assert.equal(events.at(-1)?.kind, 'HEARTBEAT');
  assert.equal(events.at(-1)?.playedSeconds, 5);
  video.seeking = true;
  video.currentTime = 240;
  tracker.seeking(video);
  video.seeking = false;
  tracker.seeked(video);
  assert.equal(events.at(-1)?.kind, 'SEEK');
  assert.equal(events.at(-1)?.playedSeconds, 0);
  now += 5_000;
  video.currentTime = 245;
  tracker.timeupdate(video);
  tracker.pause(video);
  assert.equal(events.at(-1)?.kind, 'PAUSE');
  assert.equal(events.at(-1)?.playedSeconds, 5);
});

test('buffering and paused periods are not counted as watched time', () => {
  let now = 0;
  const events: Array<{ kind: string; playedSeconds: number }> = [];
  const tracker = createPlaybackAnalyticsTracker(
    (event) => events.push(event),
    () => now,
  );
  const video = media();
  tracker.playing(video);
  now += 2_000;
  video.currentTime = 2;
  tracker.timeupdate(video);
  tracker.waiting(video);
  now += 40_000;
  tracker.heartbeat(video);
  tracker.playing(video);
  now += 1_000;
  video.currentTime = 3;
  tracker.timeupdate(video);
  video.paused = true;
  tracker.pause(video);
  assert.ok(events.find((event) => event.kind === 'PAUSE'));
  assert.ok(
    events.filter((event) => event.kind !== 'START').every((event) => event.playedSeconds <= 3),
  );
});

test('ENDED is emitted without silently inventing watched seconds', () => {
  let now = 0;
  const events: Array<{ kind: string; playedSeconds: number }> = [];
  const tracker = createPlaybackAnalyticsTracker(
    (event) => events.push(event),
    () => now,
  );
  const video = media();
  tracker.playing(video);
  now = 3_000;
  video.currentTime = 3;
  tracker.timeupdate(video);
  video.ended = true;
  video.paused = true;
  tracker.ended(video);
  assert.equal(events.at(-1)?.kind, 'ENDED');
  assert.equal(events.at(-1)?.playedSeconds, 3);
});

test('closed tracker emits nothing', () => {
  let now = 0;
  const events: string[] = [];
  const tracker = createPlaybackAnalyticsTracker(
    (event) => events.push(event.kind),
    () => now,
  );
  const video = media();
  tracker.playing(video);
  tracker.close();
  now = 30_000;
  video.currentTime = 30;
  tracker.heartbeat(video);
  tracker.ended(video);
  assert.deepEqual(events, ['START']);
});
