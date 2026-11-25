import assert from 'node:assert/strict';
import test from 'node:test';
import {
  capturePlaybackSnapshot,
  safePlaybackResumeTime,
} from '../src/features/playback/utils/playback-resume.ts';

test('retains playhead, play state, audio and manual-quality label across manifest renewal', () => {
  const snapshot = capturePlaybackSnapshot(
    {
      currentTime: 314.5,
      paused: false,
      ended: false,
      muted: true,
      volume: 0.35,
      playbackRate: 1.25,
    },
    '480p',
  );
  assert.deepEqual(snapshot, {
    positionSeconds: 314.5,
    wasPlaying: true,
    muted: true,
    volume: 0.35,
    playbackRate: 1.25,
    manualQualityLabel: '480p',
  });
});

test('a paused or ended video remains paused after manifest renewal', () => {
  const paused = capturePlaybackSnapshot(
    { currentTime: 40, paused: true, ended: false, muted: false, volume: 1, playbackRate: 1 },
    null,
  );
  const ended = capturePlaybackSnapshot(
    { currentTime: 90, paused: true, ended: true, muted: false, volume: 1, playbackRate: 1 },
    null,
  );
  assert.equal(paused.wasPlaying, false);
  assert.equal(ended.wasPlaying, false);
});

test('resume time clamps to VOD duration and rejects invalid positions', () => {
  assert.equal(safePlaybackResumeTime(100, 80), 79.75);
  assert.equal(safePlaybackResumeTime(25.25, 80), 25.25);
  assert.equal(safePlaybackResumeTime(25.25, Number.POSITIVE_INFINITY), 25.25);
  assert.equal(safePlaybackResumeTime(Number.NaN, 30), 0);
  assert.equal(safePlaybackResumeTime(-4, 30), 0);
});
