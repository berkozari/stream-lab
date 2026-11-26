import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createPlaybackAnalyticsQueue,
  playbackTokenFromManifest,
} from '../src/features/playback/utils/playback-analytics-queue.ts';

test('extracts in-memory capability, ignoring malformed and non-http URLs', () => {
  const token = playbackTokenFromManifest(
    'http://localhost:4000/api/v1/videos/id/playback/hls/master.m3u8?token=abc.xyz',
  );
  assert.equal(token, 'abc.xyz');
  assert.equal(playbackTokenFromManifest('not-a-url'), null);
  assert.equal(playbackTokenFromManifest('javascript:alert(1)?token=x'), null);
});

test('queue sends in order and sequences stay monotonic through replacement queues', async () => {
  const identity = { sessionId: '00000000-0000-4000-8000-000000000001', next: 0 };
  const delivered: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const q = createPlaybackAnalyticsQueue(identity, async (event) => {
    if (event.sequence === 0) await gate;
    delivered.push(event.sequence);
  });
  q.report({ kind: 'START', positionSeconds: 0, playedSeconds: 0 });
  q.report({ kind: 'HEARTBEAT', positionSeconds: 4, playedSeconds: 4 });
  release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  q.close();
  const next = createPlaybackAnalyticsQueue(identity, async (event) => {
    delivered.push(event.sequence);
  });
  next.report({ kind: 'START', positionSeconds: 5, playedSeconds: 0 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(delivered, [0, 1, 2]);
});

test('rejected analytics requests never block subsequent events', async () => {
  const identity = { sessionId: '00000000-0000-4000-8000-000000000002', next: 0 };
  const sent: number[] = [];
  const queue = createPlaybackAnalyticsQueue(identity, async (event) => {
    sent.push(event.sequence);
    if (event.sequence === 0) throw new Error('offline');
  });
  queue.report({ kind: 'START', positionSeconds: 0, playedSeconds: 0 });
  queue.report({ kind: 'HEARTBEAT', positionSeconds: 5, playedSeconds: 5 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(sent, [0, 1]);
});
