import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { probeLocalVideo } from '../../src/services/ffprobe/probe.js';
import { encodeHlsVideo } from '../../src/services/transcoding/ffmpeg-hls.js';

const run = promisify(execFile);

test('real FFmpeg encodes playable audio+video HLS and writes complete playlists', async (t) => {
  const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
  try {
    await run(ffmpeg, ['-version'], { timeout: 5_000 });
  } catch {
    t.skip('FFmpeg is not installed');
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), 'streamlab-real-hls-'));
  try {
    const source = join(dir, 'source.mp4');
    const output = join(dir, 'output');
    await mkdir(output);
    await run(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=size=320x240:rate=25',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:sample_rate=44100',
        '-t',
        '2',
        '-c:v',
        'mpeg4',
        '-c:a',
        'aac',
        '-shortest',
        '-y',
        source,
      ],
      { timeout: 30_000 },
    );
    const probe = await probeLocalVideo(source);
    assert.equal(probe.hasAudio, true);
    const encoded = await encodeHlsVideo(source, output, probe, new AbortController().signal);
    assert.ok(encoded.files.some((file) => file.relativePath === '240p/segment_00000.ts'));
    const playlist = await readFile(join(output, '240p', 'index.m3u8'), 'utf8');
    assert.ok(playlist.includes('#EXT-X-ENDLIST'));
    assert.ok(playlist.includes('#EXT-X-INDEPENDENT-SEGMENTS'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
