import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlaybackClient } from '../src/features/playback/services/playback-client.ts';

const videoId = '123e4567-e89b-42d3-a456-426614174000';
const playback = {
  videoId,
  protocol: 'HLS',
  manifestUrl:
    'http://localhost:4000/api/v1/videos/' + videoId + '/playback/hls/master.m3u8?token=example',
  expiresAt: '2026-11-25T15:00:00.000Z',
};

test('playback client sends an abort signal and validates the API response', async () => {
  const controller = new AbortController();
  let receivedPath: string | undefined;
  let receivedSignal: AbortSignal | undefined;
  const client = createPlaybackClient({
    async get<T>(path: string, options?: { signal?: AbortSignal }) {
      receivedPath = path;
      receivedSignal = options?.signal;
      return { data: { success: true, data: playback } as T };
    },
  });
  assert.deepEqual(await client.getPlayback(videoId, controller.signal), playback);
  assert.equal(receivedPath, `/videos/${videoId}/playback`);
  assert.equal(receivedSignal, controller.signal);
});

test('playback client rejects malformed video IDs without making an HTTP call', async () => {
  const client = createPlaybackClient({
    async get<T>() {
      assert.fail('request should not have been sent');
      return { data: {} as T };
    },
  });
  await assert.rejects(client.getPlayback('../other'));
});

test('playback client rejects an invalid playback response', async () => {
  const client = createPlaybackClient({
    async get<T>() {
      return { data: { success: true, data: { ...playback, protocol: 'DASH' } } as T };
    },
  });
  await assert.rejects(client.getPlayback(videoId));
});
