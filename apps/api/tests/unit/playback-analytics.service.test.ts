import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlaybackAnalyticsService,
  type AnalyticsStore,
} from '../../src/services/playback-analytics.service.js';
import type { PlaybackSession } from '../../src/repositories/playback-analytics.repository.js';

const videoId = '79b97eab-6c79-43fb-8263-15a2e43b46b4';
const sessionId = '87ec09b4-31b1-425e-a803-0122ec2d5a27';
const viewerId = 'e0835a2c-04d4-4f5d-b815-ccfc6c6e5f24';
const initial = new Date('2026-11-26T13:00:00.000Z');

function fakeStore() {
  const sessions = new Map<string, PlaybackSession>();
  const store: AnalyticsStore = {
    async ensure(identity, now) {
      if (!sessions.has(identity.id)) {
        sessions.set(identity.id, {
          ...identity,
          lastSequence: -1,
          lastPositionSeconds: 0,
          watchedSeconds: 0,
          qualifiedAt: null,
          completedAt: null,
          lastEventAt: now,
          startedAt: now,
        });
      }
    },
    async read(id) {
      return sessions.get(id) ?? null;
    },
    async advance(id, previousSequence, update) {
      const state = sessions.get(id);
      if (!state || state.lastSequence !== previousSequence) return false;
      sessions.set(id, {
        ...state,
        lastSequence: update.sequence,
        lastPositionSeconds: update.positionSeconds,
        watchedSeconds: state.watchedSeconds + update.increment,
        qualifiedAt: update.qualifiedAt,
        completedAt: update.completedAt,
        lastEventAt: update.now,
      });
      return true;
    },
  };
  return { store, sessions };
}
const event = (sequence: number, kind: 'START' | 'HEARTBEAT' | 'SEEK' = 'HEARTBEAT') => ({
  sessionId,
  sequence,
  kind,
  positionSeconds: 10,
  playedSeconds: 5,
  playbackToken: 'secret-not-logged',
});

test('START, heartbeat and duplicate retry count only one qualified session', async () => {
  const { store } = fakeStore();
  let now = initial;
  const ingest = createPlaybackAnalyticsService(
    store,
    async () => ({
      videoId,
      viewerId,
      processingVersion: 1,
    }),
    () => now,
  );
  const start = await ingest(videoId, event(0, 'START'));
  assert.equal(start.qualifiedView, false);
  now = new Date(initial.getTime() + 5_000);
  const watch = await ingest(videoId, event(1));
  assert.equal(watch.watchedSeconds, 5);
  assert.equal(watch.qualifiedView, true);
  assert.equal((await ingest(videoId, event(1))).watchedSeconds, 5);
  now = new Date(initial.getTime() + 6_000);
  assert.equal((await ingest(videoId, event(2, 'SEEK'))).watchedSeconds, 5);
});

test('a session ID cannot be reused for a different authenticated viewer', async () => {
  const { store } = fakeStore();
  const first = createPlaybackAnalyticsService(
    store,
    async () => ({
      videoId,
      viewerId,
      processingVersion: 1,
    }),
    () => initial,
  );
  await first(videoId, event(0, 'START'));
  const second = createPlaybackAnalyticsService(
    store,
    async () => ({
      videoId,
      viewerId: null,
      processingVersion: 1,
    }),
    () => initial,
  );
  await assert.rejects(() => second(videoId, event(1)), /different viewer or video/);
});

test('failed playback capability validation prevents any session writes', async () => {
  const { store, sessions } = fakeStore();
  const ingest = createPlaybackAnalyticsService(
    store,
    async () => {
      throw new Error('invalid playback capability');
    },
    () => initial,
  );
  await assert.rejects(() => ingest(videoId, event(0)), /invalid playback capability/);
  assert.equal(sessions.size, 0);
});
