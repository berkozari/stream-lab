/**
 * STREAM-008.8 HTTP boundary regression.
 * Real Express routers/controllers and analytics state machine, with injected
 * authentication, clock, memory repository and signed-capability verifier.
 * This does NOT prove production JWT verification or live PostgreSQL queries;
 * the --full Playwright suite covers the running application separately.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { AppError } from '../../src/utils/app-error.ts';
import { createCreatorRouter } from '../../src/routes/creator.routes.ts';
import { createVideoRouter } from '../../src/routes/video.routes.ts';
import { createCreatorVideoAnalyticsController } from '../../src/controllers/creator-video-analytics.controller.ts';
import { createCreatorAnalyticsService } from '../../src/services/creator-analytics.service.ts';
import { createCreatorVideoAnalyticsService } from '../../src/services/creator-video-analytics.service.ts';
import { createPlaybackAnalyticsService } from '../../src/services/playback-analytics.service.ts';

const ownerA = '31ad86b3-a379-4575-978c-e963ed8e5d40';
const ownerB = '2039fe32-f04e-426d-a89b-dc32d9ebc05c';
const videoA = '4cc943cd-61c4-4677-92eb-d018297c077d';
const videoB = 'd93613c8-4585-4580-a221-e12224eaa5ce';
const sessionId = '05dc7afc-a42b-4b69-b50d-4edb3a117aaf';
const NOW = new Date('2026-11-26T15:00:00.000Z');

async function withHttp(run) {
  const memory = new Map();
  let now = NOW;
  const auth = (req, res, next) => {
    const header = req.get('authorization');
    const userId =
      header === 'Bearer creator-A' ? ownerA : header === 'Bearer creator-B' ? ownerB : null;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    req.auth = { userId, user: { role: 'USER' } };
    next();
  };

  const overview = createCreatorAnalyticsService(
    {
      qualified: async (ownerId) => [
        {
          videoId: ownerId === ownerA ? videoA : videoB,
          _count: { _all: ownerId === ownerA ? 2 : 1 },
          _sum: { watchedSeconds: ownerId === ownerA ? 40 : 9 },
        },
      ],
      completed: async (ownerId) =>
        ownerId === ownerA ? [{ videoId: videoA, _count: { _all: 1 } }] : [],
      titles: async (ownerId, ids) =>
        ids
          .filter((id) => id === (ownerId === ownerA ? videoA : videoB))
          .map((id) => ({ id, title: `Video ${ownerId === ownerA ? 'A' : 'B'}` })),
    },
    () => NOW,
  );
  const videoDetails = createCreatorVideoAnalyticsService(
    {
      video: async (ownerId, id) =>
        id === (ownerId === ownerA ? videoA : videoB) ? { id, title: 'Owner video' } : null,
      totals: async (ownerId) => ({
        qualifiedViews: ownerId === ownerA ? 2 : 1,
        watchSeconds: ownerId === ownerA ? 40 : 9,
        completedViews: ownerId === ownerA ? 1 : 0,
      }),
      days: async () => [],
    },
    () => NOW,
  );
  const store = {
    async ensure(identity, stamp) {
      if (!memory.has(identity.id))
        memory.set(identity.id, {
          ...identity,
          lastSequence: -1,
          lastPositionSeconds: 0,
          watchedSeconds: 0,
          qualifiedAt: null,
          completedAt: null,
          startedAt: stamp,
          lastEventAt: stamp,
        });
    },
    async read(id) {
      return memory.get(id) ?? null;
    },
    async advance(id, sequence, change) {
      const old = memory.get(id);
      if (!old || old.lastSequence !== sequence) return false;
      memory.set(id, {
        ...old,
        lastSequence: change.sequence,
        lastPositionSeconds: change.positionSeconds,
        watchedSeconds: old.watchedSeconds + change.increment,
        qualifiedAt: change.qualifiedAt,
        completedAt: change.completedAt,
        lastEventAt: change.now,
      });
      return true;
    },
  };
  const ingest = createPlaybackAnalyticsService(
    store,
    async (id, token) => {
      if (token !== 'signed-A' && token !== 'signed-B')
        throw new AppError(403, 'PLAYBACK_DENIED', 'Invalid playback capability');
      return {
        videoId: id,
        viewerId: token === 'signed-A' ? ownerA : ownerB,
        processingVersion: 1,
      };
    },
    () => now,
  );

  const app = express();
  app.use(express.json());
  // Inject the per-video reader into the real controller. Production route wiring
  // (which uses a default database reader) is exercised by live Playwright tests.
  const injectedDetail = express.Router();
  injectedDetail.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  injectedDetail.get(
    '/videos/:videoId/analytics',
    auth,
    createCreatorVideoAnalyticsController(videoDetails),
  );
  app.use('/api/v1/creator', injectedDetail);
  app.use('/api/v1/creator', createCreatorRouter(auth, undefined, overview));
  app.use('/api/v1/videos', createVideoRouter({ authenticate: auth, playbackAnalytics: ingest }));
  app.use((error, req, res, next) => {
    void req;
    void next;
    res
      .status(error.statusCode ?? 500)
      .json({ success: false, error: { code: error.code ?? 'INTERNAL_ERROR' } });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid HTTP test listener');
  const base = `http://127.0.0.1:${address.port}/api/v1`;
  const call = (pathname, { as, method = 'GET', body } = {}) =>
    fetch(base + pathname, {
      method,
      headers: {
        ...(as ? { Authorization: `Bearer ${as}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  try {
    await run({
      call,
      setNow: (value) => {
        now = new Date(value);
      },
    });
  } finally {
    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  }
}

const event = (sequence, kind, token = 'signed-A', playedSeconds = 0) => ({
  sessionId,
  sequence,
  kind,
  positionSeconds: sequence * 5,
  playedSeconds,
  playbackToken: token,
});
const eventPath = `/videos/${videoA}/analytics/events`;

test('creator aggregate and selected video detail require a verified identity', async () => {
  await withHttp(async ({ call }) => {
    for (const pathname of [
      '/creator/analytics?range=all',
      `/creator/videos/${videoA}/analytics?range=7d`,
    ]) {
      const response = await call(pathname);
      assert.equal(response.status, 401);
      assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/u);
    }
  });
});

test('creator summary is scoped to authenticated identity, not client ownerId', async () => {
  await withHttp(async ({ call }) => {
    for (const [as, expectedVideo, expectedCount] of [
      ['creator-A', videoA, 2],
      ['creator-B', videoB, 1],
    ]) {
      const response = await call(`/creator/analytics?range=all&ownerId=${ownerA}`, { as });
      assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/u);
      const { data } = await response.json();
      assert.equal(data.qualifiedViews, expectedCount);
      assert.deepEqual(
        data.topVideos.map((video) => video.videoId),
        [expectedVideo],
      );
    }
  });
});

test('invalid analytics date ranges and video identifiers receive 422', async () => {
  await withHttp(async ({ call }) => {
    for (const pathname of [
      '/creator/analytics?range=yesterday',
      '/creator/videos/not-a-uuid/analytics?range=7d',
      `/creator/videos/${videoA}/analytics?range=nope`,
    ]) {
      const response = await call(pathname, { as: 'creator-A' });
      assert.equal(response.status, 422, pathname);
    }
  });
});

test('video detail returns 404 for a video belonging to another creator', async () => {
  await withHttp(async ({ call }) => {
    const forbidden = await call(`/creator/videos/${videoB}/analytics?range=7d`, {
      as: 'creator-A',
    });
    assert.equal(forbidden.status, 404);
    const allowed = await call(`/creator/videos/${videoA}/analytics?range=7d`, { as: 'creator-A' });
    assert.equal(allowed.status, 200);
    const { data } = await allowed.json();
    assert.equal(data.videoId, videoA);
    assert.ok(data.daily.length >= 7);
    assert.equal(data.qualifiedViews, 2);
  });
});

test('valid capability starts a session and heartbeat qualifies it exactly once', async () => {
  await withHttp(async ({ call, setNow }) => {
    const start = await call(eventPath, { method: 'POST', body: event(0, 'START') });
    assert.equal(start.status, 200);
    assert.match(start.headers.get('cache-control') ?? '', /private.*no-store/u);
    assert.equal(start.headers.get('referrer-policy'), 'no-referrer');
    assert.equal((await start.json()).data.qualifiedView, false);
    setNow('2026-11-26T15:00:05.000Z');
    const heartbeat = await call(eventPath, {
      method: 'POST',
      body: event(1, 'HEARTBEAT', 'signed-A', 5),
    });
    assert.equal(heartbeat.status, 200);
    const { data } = await heartbeat.json();
    assert.equal(data.qualifiedView, true);
    assert.equal(data.watchedSeconds, 5);
    const duplicate = await call(eventPath, {
      method: 'POST',
      body: event(1, 'HEARTBEAT', 'signed-A', 5),
    });
    assert.equal(duplicate.status, 200);
    assert.equal((await duplicate.json()).data.watchedSeconds, 5);
  });
});

test('missing signed token, invalid sequence and invalid UUID are rejected before counting', async () => {
  await withHttp(async ({ call }) => {
    for (const body of [
      { ...event(0, 'START'), playbackToken: '' },
      { ...event(0, 'START'), sequence: -1 },
      { ...event(0, 'START'), playedSeconds: 9999 },
    ]) {
      assert.equal((await call(eventPath, { method: 'POST', body })).status, 422);
    }
    assert.equal(
      (await call('/videos/bad-id/analytics/events', { method: 'POST', body: event(0, 'START') }))
        .status,
      422,
    );
    assert.equal(
      (await call(eventPath, { method: 'POST', body: event(0, 'START', 'invalid') })).status,
      403,
    );
  });
});

test('a playback session cannot be reused with another viewer capability', async () => {
  await withHttp(async ({ call }) => {
    const start = await call(eventPath, { method: 'POST', body: event(0, 'START', 'signed-A') });
    assert.equal(start.status, 200);
    const conflict = await call(eventPath, {
      method: 'POST',
      body: event(1, 'HEARTBEAT', 'signed-B', 4),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error.code, 'ANALYTICS_SESSION_CONFLICT');
  });
});
