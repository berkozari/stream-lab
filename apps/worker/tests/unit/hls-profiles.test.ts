import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planHlsProfiles, renderHlsMaster } from '../../src/services/transcoding/hls-profiles.js';

const base = { width: 1920, height: 1080, durationSeconds: 12, codec: 'h264', hasAudio: true };

test('generates ascending 240p..1080p ladder with even dimensions and no upscaling', () => {
  const profiles = planHlsProfiles(base);
  assert.deepEqual(
    profiles.map((p) => p.label),
    ['240p', '360p', '480p', '720p', '1080p'],
  );
  for (const p of profiles) {
    assert.equal(p.width % 2, 0);
    assert.equal(p.height % 2, 0);
    assert.ok(p.width <= base.width && p.height <= base.height);
  }
  const master = renderHlsMaster(profiles);
  assert.match(master, /^#EXTM3U/u);
  assert.ok(master.includes('720p/index.m3u8'));
});

test('small, odd and portrait inputs never upscale; audio-free sources get no audio bitrate', () => {
  const small = planHlsProfiles({ ...base, width: 319, height: 239, hasAudio: false });
  assert.deepEqual(
    small.map((p) => p.label),
    ['source'],
  );
  assert.deepEqual([small[0]?.width, small[0]?.height, small[0]?.audioBitrate], [318, 238, 0]);
  const portrait = planHlsProfiles({ ...base, width: 720, height: 1280 });
  assert.ok(portrait.every((p) => p.width <= 720 && p.height <= 1280));
});

test('rejects invalid source dimensions', () => {
  assert.throws(() => planHlsProfiles({ ...base, width: 1 }), /HLS_SOURCE_TOO_SMALL/u);
});
