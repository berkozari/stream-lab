import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  selectInitialResumeSnapshot,
  type PlaybackResumeSnapshot,
} from '../src/features/playback/utils/playback-resume.ts';
import { mediaProgressSample } from '../src/features/watch-history/utils/progress-reporting.ts';

const snapshot: PlaybackResumeSnapshot = {
  positionSeconds: 0,
  wasPlaying: false,
  muted: false,
  volume: 1,
  playbackRate: 1,
  manualQualityLabel: null,
};

test('StrictMode initial 0s cleanup cannot override persisted resume', () => {
  assert.equal(selectInitialResumeSnapshot(snapshot, 63, true)?.positionSeconds, 63);
  assert.equal(selectInitialResumeSnapshot(null, 63, true)?.positionSeconds, 63);
});

test('renewal after initial resume honors actual 0s seek and manual quality', () => {
  const intentionalZero = { ...snapshot, manualQualityLabel: '480p', wasPlaying: true };
  assert.deepEqual(selectInitialResumeSnapshot(intentionalZero, 63, false), intentionalZero);
});

test('no saved position leaves first playback at the beginning', () => {
  assert.equal(selectInitialResumeSnapshot(null, 0, true), null);
  assert.equal(selectInitialResumeSnapshot(null, NaN, true), null);
});

test('source teardown cannot overwrite persisted position with 0s', () => {
  assert.equal(
    mediaProgressSample({ currentTime: 0, readyState: 0, currentSrc: '', ended: false }),
    null,
  );
  assert.equal(
    mediaProgressSample({ currentTime: 0, readyState: 0, currentSrc: 'blob:old', ended: false }),
    null,
  );
});

test('real seek to 0s and normal progress still remain recordable', () => {
  const media = { currentTime: 0, readyState: 2, currentSrc: 'blob:current', ended: false };
  assert.deepEqual(mediaProgressSample(media), { positionSeconds: 0, completed: false });
  assert.deepEqual(mediaProgressSample({ ...media, currentTime: 64.8 }, true), {
    positionSeconds: 64,
    completed: true,
  });
});
