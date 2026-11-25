import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encodeHlsVideo, type HlsRunner } from '../../src/services/transcoding/ffmpeg-hls.js';

const probe = { durationSeconds: 2, width: 320, height: 240, codec: 'mpeg4', hasAudio: false };

test('creates validated master/variant assets and maps video-only input', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'streamlab-hls-test-'));
  try {
    const fakeRunner: HlsRunner = async (_, args, options) => {
      assert.ok(!args.includes('0:a:0'));
      assert.ok(args.includes('-an'));
      assert.ok(options.signal);
      const variantDir = join(dir, '240p');
      await writeFile(join(variantDir, 'segment_00000.ts'), 'video');
      await writeFile(
        join(variantDir, 'index.m3u8'),
        '#EXTM3U\n#EXTINF:2,\nsegment_00000.ts\n#EXT-X-ENDLIST\n',
      );
    };
    const data = await encodeHlsVideo(
      '/tmp/fake-source',
      dir,
      probe,
      new AbortController().signal,
      { runner: fakeRunner },
    );
    assert.deepEqual(
      data.files.map((file) => file.relativePath),
      ['240p/segment_00000.ts', '240p/index.m3u8', 'master.m3u8'],
    );
    assert.ok((await readFile(join(dir, 'master.m3u8'), 'utf8')).includes('240p/index.m3u8'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('rejects malformed FFmpeg output rather than publishing incomplete assets', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'streamlab-hls-test-'));
  try {
    await assert.rejects(
      encodeHlsVideo('/tmp/fake-source', dir, probe, new AbortController().signal, {
        runner: async () => {
          await writeFile(join(dir, '240p', 'index.m3u8'), '#EXTM3U\n../bad.ts\n#EXT-X-ENDLIST\n');
        },
      }),
      /HLS_SEGMENTS_INVALID/u,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
