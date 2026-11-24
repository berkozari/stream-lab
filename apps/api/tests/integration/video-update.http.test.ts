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

const ownerId = randomUUID();
const sessionId = randomUUID();
const videoId = randomUUID();
const categoryId = randomUUID();
const now = new Date('2026-11-24T07:00:00.000Z').toISOString();
let server: Server;
let url: string;
let token: string;
let calls = 0;
let lastInput: unknown;

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, uid) =>
      sid === sessionId && uid === ownerId
        ? {
            id: sessionId,
            user: {
              id: ownerId,
              email: 'update@example.invalid',
              displayName: 'Video Owner',
              role: 'USER',
              createdAt: new Date(),
            },
          }
        : null,
    ),
    videoUpdate: async (id, owner, input) => {
      calls++;
      lastInput = input;
      return {
        id,
        ownerId: owner,
        title: input.title ?? 'Original',
        description: input.description ?? null,
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
  token = await signAccessToken(ownerId, sessionId);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function patch(id: string, body: unknown, authorization = `Bearer ${token}`) {
  return fetch(`${url}/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
}

test('PATCH requires active JWT and a UUID', async () => {
  const previous = calls;
  assert.equal((await patch(videoId, { title: 'New' }, '')).status, 401);
  assert.equal((await patch(videoId, { title: 'New' }, 'Bearer broken.jwt')).status, 401);
  assert.equal((await patch('not-a-uuid', { title: 'New' })).status, 422);
  assert.equal(calls, previous);
});

test('PATCH validates payload and rejects mass-assignment before service', async () => {
  const previous = calls;
  for (const body of [
    {},
    { title: '  ' },
    { ownerId },
    { status: 'READY' },
    { publishedAt: now },
    { deletedAt: null },
    { categoryIds: [categoryId, categoryId] },
    { visibility: 'EXTERNAL' },
  ]) {
    assert.equal((await patch(videoId, body)).status, 422, JSON.stringify(body));
  }
  assert.equal(calls, previous);
});

test('PATCH uses verified owner, accepts partial payload and returns 200 sanitized DTO', async () => {
  const response = await patch(videoId, { title: '  Edited  ', categoryIds: [] });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = (await response.json()) as { success: boolean; data: Record<string, unknown> };
  assert.equal(body.success, true);
  assert.equal(body.data.ownerId, ownerId);
  assert.equal(body.data.title, 'Edited');
  assert.deepEqual(lastInput, { title: 'Edited', categoryIds: [] });
  assert.ok(!('deletedAt' in body.data));
  assert.ok(!('processingVersion' in body.data));
});
