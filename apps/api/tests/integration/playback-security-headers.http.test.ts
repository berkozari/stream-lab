import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';

/** Regression: Helmet remains strict everywhere except authenticated HLS media paths. */
test('HLS response headers permit cross-origin media without weakening other API routes', async () => {
  const videoId = randomUUID();
  const app = createApp({
    videoPlayback: async (id) => ({
      videoId: id,
      protocol: 'HLS',
      manifestUrl: `http://localhost:4000/api/v1/videos/${id}/playback/hls/master.m3u8?token=fake`,
      expiresAt: '2030-01-01T00:00:00.000Z',
    }),
    videoPlaybackMaster: async () => '#EXTM3U\n#EXT-X-VERSION:3\n',
    videoPlaybackVariant: async () => '#EXTM3U\n#EXTINF:2.0,\nsegment_00000.ts\n#EXT-X-ENDLIST\n',
    videoPlaybackSegment: async () =>
      'http://127.0.0.1:9000/bucket/segment_00000.ts?signature=fake',
  });
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/v1/videos/${videoId}/playback`;
    const requestHeaders = { origin: 'http://localhost:5173' };
    const api = await fetch(base, { headers: requestHeaders });
    assert.equal(api.status, 200);
    assert.equal(api.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(api.headers.get('cache-control'), 'private, no-store');
    assert.equal(api.headers.get('referrer-policy'), 'no-referrer');

    for (const path of ['/hls/master.m3u8?token=fake', '/hls/240p/index.m3u8?token=fake']) {
      const response = await fetch(`${base}${path}`, { headers: requestHeaders });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cross-origin-resource-policy'), 'cross-origin');
      assert.equal(response.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
      assert.match(response.headers.get('content-type') ?? '', /mpegurl/u);
    }

    const segment = await fetch(`${base}/hls/240p/segment_00000.ts?token=fake`, {
      headers: requestHeaders,
      redirect: 'manual',
    });
    assert.equal(segment.status, 302);
    assert.equal(segment.headers.get('cross-origin-resource-policy'), 'cross-origin');
    assert.equal(segment.headers.get('cache-control'), 'private, no-store');

    const missingToken = await fetch(`${base}/hls/master.m3u8`, { headers: requestHeaders });
    assert.equal(missingToken.status, 404);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
