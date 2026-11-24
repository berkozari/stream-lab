import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../../src/app.js';
import { createRequireAuth } from '../../src/middlewares/auth.middleware.js';
import { signAccessToken } from '../../src/lib/auth-security.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const userId = randomUUID();
const sessionId = randomUUID();
const videoId = randomUUID();
const now = new Date('2026-11-24T07:00:00.000Z').toISOString();
const categoryId = randomUUID();
const user = {
  id: userId,
  email: 'video-http@example.invalid',
  displayName: 'Video HTTP',
  role: 'USER' as const,
  createdAt: new Date(),
};
let server: Server;
let url: string;
let token: string;
let handlerCallCount = 0;
let lastOwner = '';
let lastTitle = '';
let lastCategories: string[] = [];

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, uid) =>
      sid === sessionId && uid === userId ? { id: sessionId, user } : null,
    ),
    videoCreate: async (ownerId, payload) => {
      handlerCallCount += 1;
      lastOwner = ownerId;
      lastTitle = payload.title;
      lastCategories = payload.categoryIds ?? [];
      return {
        id: videoId,
        ownerId,
        title: payload.title,
        description: payload.description ?? null,
        status: 'DRAFT',
        visibility: 'PRIVATE',
        durationSeconds: null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
      };
    },
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  url = `http://127.0.0.1:${address.port}/api/v1/videos`;
  token = await signAccessToken(userId, sessionId);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function post(body: unknown, authorization = `Bearer ${token}`) {
  return fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify(body),
  });
}

test('create requires an active signed JWT and does not trust client owner', async () => {
  const beforeCount = handlerCallCount;
  assert.equal((await post({ title: 'Test' }, '')).status, 401);
  assert.equal((await post({ title: 'Test' }, 'Bearer broken.jwt')).status, 401);
  assert.equal((await post({ title: 'Test', ownerId: randomUUID() })).status, 422);
  assert.equal(handlerCallCount, beforeCount);
});

test('POST /videos validates inputs before calling service', async () => {
  const beforeCount = handlerCallCount;
  for (const body of [
    {},
    { title: '   ' },
    { title: 'Test', categoryIds: [categoryId, categoryId] },
    { title: 'Test', status: 'READY' },
    { title: 'Test', processingVersion: 9 },
    { title: 'Test', publishedAt: new Date().toISOString() },
  ]) {
    assert.equal((await post(body)).status, 422);
  }
  assert.equal(handlerCallCount, beforeCount);
});

test('POST /videos returns sanitized 201 draft owned by the authenticated user', async () => {
  const response = await post({
    title: '   My first video  ',
    description: null,
    categoryIds: [categoryId],
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = (await response.json()) as {
    success: boolean;
    data: Record<string, unknown>;
  };
  assert.equal(body.success, true);
  assert.equal(body.data.id, videoId);
  assert.equal(body.data.ownerId, userId);
  assert.equal(body.data.status, 'DRAFT');
  assert.equal(body.data.visibility, 'PRIVATE');
  assert.equal(body.data.title, 'My first video');
  assert.equal(body.data.description, null);
  assert.equal(body.data.publishedAt, null);
  assert.equal(lastOwner, userId);
  assert.equal(lastTitle, 'My first video');
  assert.deepEqual(lastCategories, [categoryId]);
  assert.ok(!('deletedAt' in body.data));
  assert.ok(!('processingVersion' in body.data));
  assert.ok(!('storageKey' in body.data));
});
