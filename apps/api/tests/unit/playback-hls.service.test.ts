import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { MediaClaim } from '../../src/services/playback.service.js';
import {
  createPlaybackMasterService,
  createPlaybackVariantService,
  createPlaybackSegmentService,
  type PlaybackHlsStorage,
} from '../../src/services/playback-hls.service.js';

const videoId = randomUUID();
const prefix = `hls/${videoId}/v1/${randomUUID()}/`;
const claim: MediaClaim = {
  capability: {
    v: 1,
    videoId,
    processingVersion: 1,
    exp: Math.floor(Date.now() / 1000) + 900,
    viewerId: null,
    viewerRole: null,
  },
  config: {
    secret: 'y'.repeat(64),
    ttlSeconds: 900,
    publicBaseUrl: 'http://localhost:4000',
    mediaEndpoint: 'http://localhost:9000',
  },
  video: {
    id: videoId,
    ownerId: randomUUID(),
    status: 'READY',
    visibility: 'PUBLIC',
    publishedAt: new Date(),
    processingVersion: 1,
    mediaAssets: [{ processingVersion: 1, storageKey: `${prefix}master.m3u8` }],
    renditions: [
      {
        label: '240p',
        width: 426,
        height: 240,
        bitrate: 400000,
        processingVersion: 1,
        playlistKey: `${prefix}240p/index.m3u8`,
      },
      {
        label: '360p',
        width: 640,
        height: 360,
        bitrate: 800000,
        processingVersion: 1,
        playlistKey: `${prefix}360p/index.m3u8`,
      },
    ],
  },
};
const authorize = async () => claim;

function fakeStorage(input: string): PlaybackHlsStorage & { signCalls: string[]; ttls: number[] } {
  const signCalls: string[] = [];
  const ttls: number[] = [];
  return {
    signCalls,
    ttls,
    readVariant: async () => input,
    signSegment: async (key, endpoint, ttl) => {
      signCalls.push(key);
      ttls.push(ttl ?? 60);
      assert.equal(endpoint, 'http://localhost:9000');
      return `http://localhost:9000/media/${key}?signature=fake`;
    },
  };
}

test('master uses only committed and validated rendition keys', async () => {
  const master = await createPlaybackMasterService(authorize)(videoId, 'token');
  assert.equal(master.match(/#EXT-X-STREAM-INF/g)?.length, 2);
  assert.ok(master.includes('240p/index.m3u8?token=token'));
  assert.ok(master.includes('360p/index.m3u8?token=token'));
  assert.ok(!master.includes('originals/'));
});

test('variant signs each safe segment directly without an API redirect', async () => {
  const storage = fakeStorage(
    '#EXTM3U\n#EXT-X-VERSION:3\n#EXTINF:6.0,\nsegment_00000.ts\n#EXTINF:5.0,\nsegment_00001.ts\n#EXT-X-ENDLIST\n',
  );
  const playlist = await createPlaybackVariantService(authorize, storage)(videoId, '240p', 'token');
  assert.ok(
    playlist.includes(`http://localhost:9000/media/${prefix}240p/segment_00000.ts?signature=fake`),
  );
  assert.ok(
    playlist.includes(`http://localhost:9000/media/${prefix}240p/segment_00001.ts?signature=fake`),
  );
  assert.ok(!playlist.includes('/playback/hls/240p/segment_00000.ts'));
  assert.ok(playlist.includes('#EXT-X-ENDLIST'));
  assert.deepEqual(storage.signCalls, [
    `${prefix}240p/segment_00000.ts`,
    `${prefix}240p/segment_00001.ts`,
  ]);
  assert.ok(storage.ttls.every((ttl) => ttl > 0 && ttl <= 900));
});

test('variant rejects path traversal, key URIs, external addresses, missing endlist', async () => {
  for (const body of [
    '#EXTM3U\n../originals/secret\n#EXT-X-ENDLIST',
    '#EXTM3U\nhttps://evil.invalid/a.ts\n#EXT-X-ENDLIST',
    '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="http://evil.invalid"\nsegment_00000.ts\n#EXT-X-ENDLIST',
    '#EXTM3U\nsegment_00000.ts',
  ]) {
    await assert.rejects(
      () => createPlaybackVariantService(authorize, fakeStorage(body))(videoId, '240p', 'token'),
      { statusCode: 502 },
    );
  }
  await assert.rejects(
    () =>
      createPlaybackVariantService(authorize, fakeStorage('#EXTM3U'))(
        videoId,
        'invalid!!',
        'token',
      ),
    { statusCode: 404 },
  );
});

test('segment redirect signs only whitelisted segment of committed rendition', async () => {
  const storage = fakeStorage('');
  const redirect = await createPlaybackSegmentService(authorize, storage)(
    videoId,
    '360p',
    'segment_00001.ts',
    'token',
  );
  assert.ok(redirect.startsWith('http://localhost:9000/media/'));
  assert.deepEqual(storage.signCalls, [`${prefix}360p/segment_00001.ts`]);
  await assert.rejects(
    () => createPlaybackSegmentService(authorize, storage)(videoId, '360p', '../secret', 'token'),
    { statusCode: 404 },
  );
  await assert.rejects(
    () =>
      createPlaybackSegmentService(authorize, storage)(
        videoId,
        '1080p',
        'segment_00001.ts',
        'token',
      ),
    { statusCode: 404 },
  );
});
