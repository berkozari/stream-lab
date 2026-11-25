import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyHlsFailure,
  classifyMediaError,
  nextPlaybackPhase,
  playbackFailureText,
  playbackPhaseText,
} from '../src/features/playback/utils/playback-status.ts';
import { videoStatusRefetchInterval } from '../src/features/videos/utils/video-status-polling.ts';

test('load -> ready -> buffering -> playing -> ended', () => {
  let state = nextPlaybackPhase('loading', 'loadedmetadata', true);
  assert.equal(state, 'loading');
  state = nextPlaybackPhase(state, 'canplay', true);
  assert.equal(state, 'ready');
  state = nextPlaybackPhase(state, 'waiting', false);
  assert.equal(state, 'buffering');
  assert.equal(playbackPhaseText(state), 'Video yükleniyor…');
  state = nextPlaybackPhase(state, 'playing', false);
  assert.equal(state, 'ready');
  state = nextPlaybackPhase(state, 'ended', true);
  assert.equal(state, 'ended');
});

test('does not display buffering when video is intentionally paused', () => {
  assert.equal(nextPlaybackPhase('ready', 'waiting', true), 'ready');
  assert.equal(nextPlaybackPhase('ready', 'seeking', true), 'ready');
  assert.equal(nextPlaybackPhase('ready', 'seeking', false), 'buffering');
  assert.equal(nextPlaybackPhase('buffering', 'seeked', false), 'ready');
});

test('an error remains visible until the next user-initiated attempt', () => {
  assert.equal(nextPlaybackPhase('error', 'canplay', false), 'error');
  assert.equal(nextPlaybackPhase('error', 'playing', false), 'error');
  assert.equal(nextPlaybackPhase('error', 'loadstart', false), 'loading');
});

test('loading and ready have appropriate nonintrusive labels', () => {
  assert.equal(playbackPhaseText('loading'), 'Video hazırlanıyor…');
  assert.equal(playbackPhaseText('ready'), null);
  assert.equal(playbackPhaseText('ended'), null);
});

test('classifies HTML media errors without disclosing a signed URL', () => {
  assert.equal(classifyMediaError(2), 'network');
  assert.equal(classifyMediaError(3), 'media');
  assert.equal(classifyMediaError(4), 'unsupported');
  assert.equal(classifyMediaError(undefined), 'unknown');
  assert.match(playbackFailureText('network'), /Bağlantınızı/u);
  assert.doesNotMatch(playbackFailureText('unknown'), /token|signature|https?:/iu);
});

test('classifies fatal HLS errors without guessing a cause', () => {
  assert.equal(classifyHlsFailure('networkError'), 'network');
  assert.equal(classifyHlsFailure('mediaError'), 'media');
  assert.equal(classifyHlsFailure('otherError'), 'unknown');
});

test('polls only pending processing statuses and stops after READY/FAILED', () => {
  assert.equal(videoStatusRefetchInterval('QUEUED'), 5000);
  assert.equal(videoStatusRefetchInterval('PROCESSING'), 5000);
  assert.equal(videoStatusRefetchInterval('READY'), false);
  assert.equal(videoStatusRefetchInterval('FAILED'), false);
  assert.equal(videoStatusRefetchInterval(undefined), false);
});
