import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeHlsVideo } from '../../src/services/transcoding/ffmpeg-hls.js';
import { downloadVerifiedOriginal } from '../../src/services/storage/original-source.js';

const probe = { durationSeconds: 5, width: 320, height: 240, codec: 'h264', hasAudio: false };

test('FFmpeg abort is classified as cancellation; no master is published', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'streamlab-hls-shutdown-'));
  const abort = new AbortController();
  try {
    await assert.rejects(
      encodeHlsVideo('/unused', dir, probe, abort.signal, {
        runner: async (_binary, _args, opts) => {
          assert.equal(opts.signal, abort.signal);
          abort.abort();
          throw new Error('signal aborted');
        },
      }),
      /TRANSCODING_CANCELLED/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('original download refuses an already aborted processing attempt', async () => {
  const abort = new AbortController();
  abort.abort();
  await assert.rejects(
    downloadVerifiedOriginal(
      {
        storageKey:
          'originals/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000/source',
        sizeBytes: 5n,
      },
      { signal: abort.signal },
    ),
    /TRANSCODING_CANCELLED/,
  );
});
