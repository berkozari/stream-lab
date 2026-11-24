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
const now = new Date('2026-11-24T08:00:00.000Z').toISOString();
const video = {
  id: videoId,
  ownerId: userId,
  title: 'HTTP Video',
  description: null,
  status: 'DRAFT' as const,
  visibility: 'PRIVATE' as const,
  durationSeconds: null,
  publishedAt: null,
  createdAt: now,
  updatedAt: now,
};
let server: Server;
let base: string;
let token: string;
let receivedScope = '';
let receivedViewer = '';

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, uid) =>
      sid === sessionId && uid === userId
        ? {
            id: sessionId,
            user: {
              id: userId,
              email: 'reader@example.invalid',
              displayName: 'Video Reader',
              role: 'USER',
              createdAt: new Date(),
            },
          }
        : null,
    ),
    videoList: async (input) => {
      receivedScope = input.scope;
      return { items: [video], nextCursor: null };
    },
    videoDetail: async (_id, viewer) => {
      receivedViewer = viewer?.userId ?? 'guest';
      return video;
    },
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}/api/v1/videos`;
  token = await signAccessToken(userId, sessionId);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test('public listing is anonymous, paginated and query validated', async () => {
  const response = await fetch(`${base}?limit=2`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(receivedScope, 'public');
  assert.equal(((await response.json()) as { data: { items: unknown[] } }).data.items.length, 1);
  for (const query of ['limit=51', 'limit=0', 'q=%20%20%20', 'invalid=x']) {
    const res = await fetch(`${base}?${query}`);
    // Syntactically valid opaque cursors are checked at the service level; invalid shape is 422.
    assert.equal(res.status, 422, query);
  }
});

test('owner listing requires active access token and validates query', async () => {
  assert.equal((await fetch(`${base}/mine`)).status, 401);
  assert.equal(
    (await fetch(`${base}/mine`, { headers: { authorization: 'Bearer wrong.jwt' } })).status,
    401,
  );
  const response = await fetch(`${base}/mine?limit=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(response.status, 200);
  assert.equal(receivedScope, 'mine');
  assert.equal(((await response.json()) as { data: { items: unknown[] } }).data.items.length, 1);
});

test('detail optionally authenticates; invalid bearer is rejected, invalid UUID is 422', async () => {
  assert.equal((await fetch(`${base}/not-a-uuid`)).status, 422);
  assert.equal(
    (await fetch(`${base}/${videoId}`, { headers: { authorization: 'Bearer bad' } })).status,
    401,
  );
  assert.equal((await fetch(`${base}/${videoId}`)).status, 200);
  assert.equal(receivedViewer, 'guest');
  const authenticated = await fetch(`${base}/${videoId}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(authenticated.status, 200);
  assert.equal(receivedViewer, userId);
});
