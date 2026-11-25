import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import type { PlaybackRecord } from '../../src/repositories/playback.repository.js';
import {
  createPlaybackService,
  authorizeMediaClaim,
  requirePlayable,
} from '../../src/services/playback.service.js';
import { verifyPlaybackCapability } from '../../src/lib/playback-capability.js';
import type { PlaybackConfig } from '../../src/config/playback-env.js';

const id = randomUUID();
const ownerId = randomUUID();
const otherId = randomUUID();
const secret = 'x'.repeat(64);
const config: PlaybackConfig = {
  publicBaseUrl: 'http://localhost:4000',
  mediaEndpoint: 'http://127.0.0.1:9000',
  secret,
  ttlSeconds: 900,
};
const clock = () => Date.parse('2026-11-25T10:00:00.000Z');
const prefix = `hls/${id}/v2/${randomUUID()}/`;
const base: PlaybackRecord = {
  id,
  ownerId,
  visibility: 'PRIVATE',
  status: 'READY',
  publishedAt: null,
  processingVersion: 2,
  mediaAssets: [{ storageKey: `${prefix}master.m3u8`, processingVersion: 2 }],
  renditions: [
    {
      label: '240p',
      width: 426,
      height: 240,
      bitrate: 400000,
      playlistKey: `${prefix}240p/index.m3u8`,
      processingVersion: 2,
    },
  ],
};

const reader = async () => base;
const getConfig = () => config;
const mint = createPlaybackService(reader, getConfig, clock);

function tokenFromUrl(manifestUrl: string) {
  const token = new URL(manifestUrl).searchParams.get('token');
  assert.ok(token);
  return token;
}

test('PRIVATE READY playable by owner/admin, hidden from anonymous and other users', async () => {
  await assert.rejects(() => mint(id), { code: 'VIDEO_NOT_FOUND', statusCode: 404 });
  await assert.rejects(() => mint(id, { userId: otherId, role: 'USER' }), { statusCode: 404 });
  const owned = await mint(id, { userId: ownerId, role: 'USER' });
  assert.equal(owned.protocol, 'HLS');
  assert.equal(owned.videoId, id);
  assert.ok(owned.manifestUrl.includes('/playback/hls/master.m3u8?token='));
  assert.ok((await mint(id, { userId: otherId, role: 'ADMIN' })).manifestUrl);
});

test('PUBLIC/UNLISTED need READY and publishedAt; PRIVATE owner gets conflict before READY', async () => {
  assert.doesNotThrow(() =>
    requirePlayable({ ...base, visibility: 'PUBLIC', publishedAt: new Date() }),
  );
  assert.doesNotThrow(() =>
    requirePlayable({ ...base, visibility: 'UNLISTED', publishedAt: new Date() }),
  );
  assert.throws(() => requirePlayable({ ...base, visibility: 'PUBLIC' }), { statusCode: 404 });
  assert.throws(
    () => requirePlayable({ ...base, status: 'QUEUED' }, { userId: ownerId, role: 'USER' }),
    { statusCode: 409 },
  );
  assert.throws(
    () => requirePlayable({ ...base, mediaAssets: [] }, { userId: ownerId, role: 'USER' }),
    { statusCode: 409 },
  );
});

test('capability has bounded lifetime and tampering is rejected', async () => {
  const response = await mint(id, { userId: ownerId, role: 'USER' });
  const token = tokenFromUrl(response.manifestUrl);
  const valid = verifyPlaybackCapability(token, secret, clock());
  assert.equal(valid.processingVersion, 2);
  assert.equal(valid.viewerId, ownerId);
  assert.throws(() => verifyPlaybackCapability(token, secret, clock() + 901_000), {
    statusCode: 404,
  });
  assert.throws(() => verifyPlaybackCapability(token.slice(0, -1) + '!', secret, clock()), {
    statusCode: 404,
  });
});

test('media rechecks status, visibility, video ID and processing version', async () => {
  const token = tokenFromUrl((await mint(id, { userId: ownerId, role: 'USER' })).manifestUrl);
  const claim = await authorizeMediaClaim(id, token, reader, getConfig, clock);
  assert.equal(claim.video.id, id);
  await assert.rejects(() => authorizeMediaClaim(randomUUID(), token, reader, getConfig, clock), {
    statusCode: 404,
  });
  await assert.rejects(
    () =>
      authorizeMediaClaim(id, token, async () => ({ ...base, status: 'FAILED' }), getConfig, clock),
    { statusCode: 409 },
  );
  await assert.rejects(
    () =>
      authorizeMediaClaim(
        id,
        token,
        async () => ({ ...base, processingVersion: 3 }),
        getConfig,
        clock,
      ),
    { statusCode: 404 },
  );
  await assert.rejects(
    () => authorizeMediaClaim(id, token, reader, getConfig, () => clock() + 901_000),
    { statusCode: 404 },
  );
});

test('public capability loses access if video becomes private', async () => {
  const published = { ...base, visibility: 'PUBLIC' as const, publishedAt: new Date() };
  const publicMint = createPlaybackService(async () => published, getConfig, clock);
  const token = tokenFromUrl((await publicMint(id)).manifestUrl);
  await assert.rejects(() => authorizeMediaClaim(id, token, reader, getConfig, clock), {
    statusCode: 404,
  });
});
