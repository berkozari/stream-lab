import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { test } from 'node:test';
import type { RequestHandler } from 'express';
import { createApp } from '../../src/app.js';

const videoId = randomUUID();
const authenticate: RequestHandler = (req, _res, next) => {
  if (req.get('authorization') !== 'Bearer test-owner') {
    next(new Error('mock authorization failed'));
    return;
  }
  req.auth = {
    userId: videoId,
    sessionId: randomUUID(),
    user: {
      id: videoId,
      email: 'owner@example.invalid',
      role: 'USER',
      displayName: 'Owner',
      avatarUrl: null,
      createdAt: new Date().toISOString(),
    },
  };
  next();
};

test('GET playback and tokenized media routes return safe headers and correct content types', async () => {
  let viewer = 'missing';
  const app = createApp({
    authenticate,
    videoPlayback: async (id, input) => {
      assert.equal(id, videoId);
      viewer = input?.userId ?? 'anonymous';
      return {
        videoId: id,
        protocol: 'HLS',
        manifestUrl: `http://localhost:4000/hls/master?token=fake`,
        expiresAt: new Date().toISOString(),
      };
    },
    videoPlaybackMaster: async () => '#EXTM3U\n#EXT-X-VERSION:3\n',
    videoPlaybackVariant: async () => '#EXTM3U\n#EXTINF:1,\nsegment_00000.ts\n#EXT-X-ENDLIST\n',
    videoPlaybackSegment: async () => 'http://127.0.0.1:9000/streamlab-media/key?signature=fake',
  });
  const server: Server = app.listen(0);
  try {
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = `http://127.0.0.1:${address.port}/api/v1/videos/${videoId}/playback`;

    const anonymous = await fetch(base);
    assert.equal(anonymous.status, 200);
    assert.equal(viewer, 'anonymous');
    assert.equal(anonymous.headers.get('cache-control'), 'private, no-store');
    assert.equal(anonymous.headers.get('referrer-policy'), 'no-referrer');
    const authenticated = await fetch(base, { headers: { authorization: 'Bearer test-owner' } });
    assert.equal(authenticated.status, 200);
    assert.equal(viewer, videoId);

    const master = await fetch(`${base}/hls/master.m3u8?token=fake`);
    assert.equal(master.status, 200);
    assert.match(master.headers.get('content-type') ?? '', /mpegurl/u);
    const variant = await fetch(`${base}/hls/240p/index.m3u8?token=fake`);
    assert.equal(variant.status, 200);
    assert.match(variant.headers.get('content-type') ?? '', /mpegurl/u);
    const segment = await fetch(`${base}/hls/240p/segment_00001.ts?token=fake`, {
      redirect: 'manual',
    });
    assert.equal(segment.status, 302);
    assert.equal(
      segment.headers.get('location'),
      'http://127.0.0.1:9000/streamlab-media/key?signature=fake',
    );
    assert.equal(segment.headers.get('cache-control'), 'private, no-store');
    assert.equal((await fetch(`${base}/hls/master.m3u8`)).status, 404);
    assert.equal(
      (
        await fetch(`${base}/hls/master.m3u8?token=fake`, {
          headers: { authorization: 'Bearer invalid' },
        })
      ).status,
      200,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
