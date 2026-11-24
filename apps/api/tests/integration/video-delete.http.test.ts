import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';
import { createApp } from '../../src/app.js';
import { createRequireAuth } from '../../src/middlewares/auth.middleware.js';
import { signAccessToken } from '../../src/lib/auth-security.js';
import { AppError } from '../../src/utils/app-error.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const ownerId = randomUUID();
const strangerId = randomUUID();
const ownerSession = randomUUID();
const strangerSession = randomUUID();
const videoId = randomUUID();
let server: Server;
let endpoint: string;
let ownerToken: string;
let strangerToken: string;
const calls: Array<{ videoId: string; ownerId: string }> = [];

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, uid) => {
      const matched =
        sid === ownerSession && uid === ownerId
          ? { id: ownerSession, userId: ownerId }
          : sid === strangerSession && uid === strangerId
            ? { id: strangerSession, userId: strangerId }
            : null;
      return matched
        ? {
            id: matched.id,
            user: {
              id: matched.userId,
              email: 'owner@example.invalid',
              displayName: 'Video Owner',
              role: 'USER',
              createdAt: new Date(),
            },
          }
        : null;
    }),
    videoDelete: async (id, userId) => {
      calls.push({ videoId: id, ownerId: userId });
      if (userId !== ownerId || id !== videoId) {
        throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
      }
      return { status: 'DELETING' };
    },
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  endpoint = `http://127.0.0.1:${address.port}/api/v1/videos`;
  ownerToken = await signAccessToken(ownerId, ownerSession);
  strangerToken = await signAccessToken(strangerId, strangerSession);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function request(id: string, token?: string): Promise<Response> {
  return fetch(`${endpoint}/${id}`, {
    method: 'DELETE',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

test('DELETE requires active JWT; invalid UUID is rejected before reaching service', async () => {
  const previous = calls.length;
  assert.equal((await request(videoId)).status, 401);
  assert.equal((await request(videoId, 'broken.token')).status, 401);
  assert.equal((await request('not-a-uuid', ownerToken)).status, 422);
  assert.equal(calls.length, previous);
});

test('DELETE authorizes using session owner and returns 202 without internal fields', async () => {
  const response = await request(videoId, ownerToken);
  assert.equal(response.status, 202);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { success: true, data: { status: 'DELETING' } });
  assert.deepEqual(calls.at(-1), { videoId, ownerId });
});

test('foreign-owned and missing videos return the same 404 response', async () => {
  const stranger = await request(videoId, strangerToken);
  const missing = await request(randomUUID(), ownerToken);
  assert.equal(stranger.status, 404);
  assert.equal(missing.status, 404);
  const strangerBody = (await stranger.json()) as { error: { code: string; message: string } };
  const missingBody = (await missing.json()) as { error: { code: string; message: string } };
  assert.deepEqual(strangerBody.error, missingBody.error);
});
