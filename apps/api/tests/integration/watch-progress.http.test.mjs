/**
 * STREAM-007.6: isolated HTTP boundary tests using a deliberately injected auth
 * identity and in-memory repository. These do NOT test real JWT cryptography,
 * production database SQL or media storage.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import { createWatchProgressRouter } from '../../src/routes/watch-progress.routes.ts';
import { createWatchProgressService } from '../../src/services/watch-progress.service.ts';

const videoId = 'e84a9bee-6fa0-40f0-b93a-84462c164539';
const secondVideoId = '984693ad-9fa5-4ee3-9f0c-1560b0d6c226';
const notEligibleId = '864693ad-9fa5-4ee3-9f0c-1560b0d6c226';
const userA = 'a14f6c8d-2e23-42eb-84dd-26d124d60ee8';
const userB = '0b18af95-18a6-442a-9be1-f707d28f26e3';

async function withServer(fn) {
  const records = new Map();
  let tick = 0;
  const store = {
    eligibleVideo: async (id) =>
      [videoId, secondVideoId].includes(id) ? { id, durationSeconds: 120 } : null,
    read: async (userId, id) => records.get(`${userId}:${id}`) ?? null,
    save: async (userId, id, positionSeconds, completedAt, lastWatchedAt) => {
      const record = { videoId: id, positionSeconds, completedAt, lastWatchedAt };
      records.set(`${userId}:${id}`, record);
      return record;
    },
    list: async ({ viewer, mode, limit, cursor }) => {
      const rows = [...records.entries()]
        .filter(([key, row]) => {
          if (!key.startsWith(`${viewer.userId}:`)) return false;
          if (mode === 'continue' && (row.completedAt || row.positionSeconds === 0)) return false;
          if (!cursor) return true;
          return (
            row.lastWatchedAt < cursor.lastWatchedAt ||
            (row.lastWatchedAt.getTime() === cursor.lastWatchedAt.getTime() &&
              row.videoId < cursor.videoId)
          );
        })
        .map(([, row]) => ({
          ...row,
          video: {
            id: row.videoId,
            title: 'E2E fixture',
            durationSeconds: 120,
            visibility: 'PUBLIC',
          },
        }))
        .sort((a, b) => b.lastWatchedAt - a.lastWatchedAt || b.videoId.localeCompare(a.videoId));
      return rows.slice(0, limit + 1);
    },
  };
  const service = createWatchProgressService(
    store,
    () => new Date(Date.UTC(2026, 10, 26, 10, 0, tick++)),
  );
  const authenticate = (req, res, next) => {
    const identity = req.get('authorization');
    const userId =
      identity === 'Bearer fixture-A' ? userA : identity === 'Bearer fixture-B' ? userB : null;
    if (!userId) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    req.auth = { userId, user: { role: 'USER' } };
    next();
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1/users/me', createWatchProgressRouter(authenticate, service));
  // Express requires four parameters to recognize error middleware.
  // eslint-disable-next-line no-unused-vars
  app.use((error, _req, res, _next) => {
    res.status(error.statusCode ?? 500).json({
      success: false,
      error: { code: error.code ?? 'INTERNAL_ERROR' },
    });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Invalid test HTTP listener');
  const base = `http://127.0.0.1:${address.port}/api/v1/users/me`;
  async function call(path, token, method = 'GET', body) {
    return fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  try {
    await fn({ call });
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('anonymous progress/history requests are rejected with private no-store responses', async () => {
  await withServer(async ({ call }) => {
    for (const [method, path, body] of [
      ['GET', `/watch-progress/${videoId}`],
      ['PUT', `/watch-progress/${videoId}`, { positionSeconds: 10 }],
      ['GET', '/watch-history'],
      ['GET', '/continue-watching'],
    ]) {
      const response = await call(path, undefined, method, body);
      assert.equal(response.status, 401, `${method} ${path}`);
      assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/u);
    }
  });
});

test('HTTP calls isolate progress and history by authenticated viewer', async () => {
  await withServer(async ({ call }) => {
    const path = `/watch-progress/${videoId}`;
    const aSave = await call(path, 'fixture-A', 'PUT', { positionSeconds: 37 });
    const bSave = await call(path, 'fixture-B', 'PUT', { positionSeconds: 12 });
    assert.equal(aSave.status, 200);
    assert.equal(bSave.status, 200);
    for (const [token, position] of [
      ['fixture-A', 37],
      ['fixture-B', 12],
    ]) {
      const read = await call(path, token);
      assert.equal(read.status, 200);
      assert.equal((await read.json()).data.positionSeconds, position);
      const history = await call('/watch-history', token);
      assert.equal(history.status, 200);
      const rows = (await history.json()).data.items;
      assert.deepEqual(
        rows.map((row) => row.positionSeconds),
        [position],
      );
      const continuing = await call('/continue-watching', token);
      assert.equal(continuing.status, 200);
      assert.deepEqual(
        (await continuing.json()).data.items.map((row) => row.positionSeconds),
        [position],
      );
    }
  });
});

test('validation rejects extra userId, invalid seconds and malformed video IDs', async () => {
  await withServer(async ({ call }) => {
    for (const payload of [
      { positionSeconds: -1 },
      { positionSeconds: 5, userId: userB },
      { positionSeconds: 2.5 },
    ]) {
      const response = await call(`/watch-progress/${videoId}`, 'fixture-A', 'PUT', payload);
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
    }
    assert.equal((await call(`/watch-progress/${notEligibleId}`, 'fixture-A')).status, 404);
    assert.equal((await call('/watch-progress/not-an-id', 'fixture-A')).status, 422);
  });
});

test('opaque pagination cursor is bound to its viewer and list mode', async () => {
  await withServer(async ({ call }) => {
    for (const [id, position] of [
      [videoId, 15],
      [secondVideoId, 20],
    ]) {
      assert.equal(
        (await call(`/watch-progress/${id}`, 'fixture-A', 'PUT', { positionSeconds: position }))
          .status,
        200,
      );
    }
    const firstResponse = await call('/watch-history?limit=1', 'fixture-A');
    assert.equal(firstResponse.status, 200);
    const firstPage = (await firstResponse.json()).data;
    assert.equal(firstPage.items.length, 1);
    assert.ok(firstPage.nextCursor);
    const cursor = encodeURIComponent(firstPage.nextCursor);
    const secondResponse = await call(`/watch-history?limit=1&cursor=${cursor}`, 'fixture-A');
    assert.equal(secondResponse.status, 200);
    const secondPage = (await secondResponse.json()).data;
    assert.equal(secondPage.items.length, 1);
    assert.notEqual(firstPage.items[0].videoId, secondPage.items[0].videoId);
    for (const [token, path] of [
      ['fixture-B', `/watch-history?limit=1&cursor=${cursor}`],
      ['fixture-A', `/continue-watching?limit=1&cursor=${cursor}`],
    ]) {
      const response = await call(path, token);
      assert.equal(response.status, 422);
      assert.equal((await response.json()).error.code, 'INVALID_CURSOR');
    }
  });
});
