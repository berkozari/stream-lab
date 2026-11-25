import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseVideoProbe, probeLocalVideo } from '../../src/services/ffprobe/probe.js';

const sample = JSON.stringify({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 },
    { codec_type: 'audio' },
  ],
  format: { duration: '12.52' },
});

test('parses bounded video metadata', () => {
  assert.deepEqual(parseVideoProbe(sample), {
    durationSeconds: 12.52,
    width: 1280,
    height: 720,
    codec: 'h264',
    hasAudio: true,
  });
});

test('rejects missing video stream and malformed duration', () => {
  assert.throws(
    () =>
      parseVideoProbe(
        JSON.stringify({ streams: [{ codec_type: 'audio' }], format: { duration: '3' } }),
      ),
    /VIDEO_STREAM_MISSING/,
  );
  assert.throws(
    () =>
      parseVideoProbe(
        JSON.stringify({
          streams: [{ codec_type: 'video', codec_name: 'h264', width: 400, height: 400 }],
          format: { duration: 'NaN' },
        }),
      ),
    /DURATION_INVALID/,
  );
});

test('rejects malformed JSON and absurd dimensions', () => {
  assert.throws(() => parseVideoProbe('{bad'), /JSON_INVALID/);
  assert.throws(
    () =>
      parseVideoProbe(
        JSON.stringify({
          streams: [{ codec_type: 'video', codec_name: 'h264', width: 20000, height: 100 }],
          format: { duration: '5' },
        }),
      ),
    /VIDEO_METADATA_INVALID/,
  );
});

test('reports ffprobe executable failures without surfacing its stderr', async () => {
  await assert.rejects(
    probeLocalVideo('/unused', '/binary/that/is/not/present'),
    /FFPROBE_EXECUTION_FAILED/,
  );
});
