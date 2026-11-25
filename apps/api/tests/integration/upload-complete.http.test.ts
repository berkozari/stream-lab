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
const foreignId = randomUUID();
const ownerSession = randomUUID();
const foreignSession = randomUUID();
const uploadId = randomUUID();
const videoId = randomUUID();
let server: Server;
let endpoint: string;
let ownerToken: string;
let foreignToken: string;
let completeCalls = 0;

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, uid) => {
      const known =
        (sid === ownerSession && uid === ownerId) || (sid === foreignSession && uid === foreignId);
      return known
        ? {
            id: sid,
            user: {
              id: uid,
              email: 'user@example.invalid',
              displayName: 'Test',
              role: 'USER',
              createdAt: new Date(),
            },
          }
        : null;
    }),
    uploadComplete: async (id, uid) => {
      completeCalls += 1;
      if (id !== uploadId || uid !== ownerId) {
        throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
      }
      return { videoId, uploadId, status: 'QUEUED' };
    },
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  endpoint = `http://127.0.0.1:${address.port}/api/v1/uploads`;
  ownerToken = await signAccessToken(ownerId, ownerSession);
  foreignToken = await signAccessToken(foreignId, foreignSession);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function request(id: string, token?: string, body?: string) {
  return fetch(`${endpoint}/${id}/complete`, {
    method: 'POST',
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    ...(body ? { body } : {}),
  });
}

test('only an authenticated valid UUID can reach completion', async () => {
  const before = completeCalls;
  assert.equal((await request(uploadId)).status, 401);
  assert.equal((await request('not-a-uuid', ownerToken)).status, 422);
  assert.equal(completeCalls, before);
});

test('owner completes without exposing storage keys or signatures', async () => {
  const response = await request(uploadId, ownerToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = (await response.json()) as { success: boolean; data: Record<string, unknown> };
  assert.equal(payload.success, true);
  assert.deepEqual(payload.data, { videoId, uploadId, status: 'QUEUED' });
});

test('foreign-owned upload and nonexistent upload are indistinguishable', async () => {
  const foreign = await request(uploadId, foreignToken);
  const missing = await request(randomUUID(), ownerToken);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  const a = (await foreign.json()) as { error: { code: string } };
  const b = (await missing.json()) as { error: { code: string } };
  assert.equal(a.error.code, b.error.code);
});
