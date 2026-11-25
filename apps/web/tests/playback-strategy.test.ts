import assert from 'node:assert/strict';
import test from 'node:test';
import { choosePlaybackStrategy } from '../src/features/playback/utils/playback-strategy.ts';

test('prefers hls.js when both native HLS and MSE support are reported', () => {
  assert.equal(choosePlaybackStrategy(true, true), 'hlsjs');
});
test('falls back to native HLS when hls.js/MSE is unavailable', () => {
  assert.equal(choosePlaybackStrategy(true, false), 'native');
});
test('uses hls.js when only MSE support is available', () => {
  assert.equal(choosePlaybackStrategy(false, true), 'hlsjs');
});
test('reports unsupported browsers without either playback engine', () => {
  assert.equal(choosePlaybackStrategy(false, false), 'unsupported');
});
