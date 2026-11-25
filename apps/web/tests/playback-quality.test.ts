import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyQualitySelection,
  buildQualityOptions,
} from '../src/features/playback/utils/quality-options.ts';

test('shows real HLS resolutions while preserving original hls.js indexes', () => {
  const result = buildQualityOptions([
    { height: 240, bitrate: 400000 },
    { height: 720, bitrate: 2500000 },
    { height: 360, bitrate: 800000 },
    { height: 480, bitrate: 1400000 },
  ]);
  assert.deepEqual(result, [
    { index: 1, label: '720p' },
    { index: 3, label: '480p' },
    { index: 2, label: '360p' },
    { index: 0, label: '240p' },
  ]);
});

test('single rendition remains a valid single quality option', () => {
  assert.deepEqual(buildQualityOptions([{ height: 360, bitrate: 500000 }]), [
    { index: 0, label: '360p' },
  ]);
});

test('falls back to bitrate when resolution is unavailable', () => {
  assert.deepEqual(buildQualityOptions([{ bitrate: 750000 }]), [{ index: 0, label: '750 kbps' }]);
});

test('distinguishes same-height renditions by bitrate', () => {
  assert.deepEqual(
    buildQualityOptions([
      { height: 720, bitrate: 2000000 },
      { height: 720, bitrate: 3500000 },
    ]),
    [
      { index: 1, label: '720p (3500 kbps)' },
      { index: 0, label: '720p (2000 kbps)' },
    ],
  );
});

test('handles empty and metadata-free level lists safely', () => {
  assert.deepEqual(buildQualityOptions([]), []);
  assert.deepEqual(buildQualityOptions([{}]), [{ index: 0, label: 'Profil 1' }]);
});

test('switches selected quality without resetting the player and restores ABR with -1', () => {
  const controller = { nextLevel: -1 };
  const options = buildQualityOptions([{ height: 240 }, { height: 720 }]);
  assert.equal(applyQualitySelection(controller, options, 1), true);
  assert.equal(controller.nextLevel, 1);
  assert.equal(applyQualitySelection(controller, options, -1), true);
  assert.equal(controller.nextLevel, -1);
});

test('rejects unsupported quality index and missing hls.js instance', () => {
  const controller = { nextLevel: -1 };
  const options = buildQualityOptions([{ height: 360 }]);
  assert.equal(applyQualitySelection(controller, options, 999), false);
  assert.equal(controller.nextLevel, -1);
  assert.equal(applyQualitySelection(null, options, 0), false);
});
