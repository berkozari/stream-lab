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
const videoId = randomUUID();
let server: Server;
let endpoint: string;
let ownerToken: string;
let foreignToken: string;
const calls: Array<{ videoId: string; ownerId: string }> = [];

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
              email: 'e2e@example.invalid',
              displayName: 'Test',
              role: 'USER',
              createdAt: new Date(),
            },
          }
        : null;
    }),
    videoUploadCreate: async (id, userId) => {
      calls.push({ videoId: id, ownerId: userId });
      if (userId !== ownerId || id !== videoId) {
        throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
      }
      return {
        uploadId: randomUUID(),
        videoId: id,
        status: 'INITIATED',
        mode: 'SINGLE',
        expiresAt: new Date().toISOString(),
      };
    },
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  endpoint = `http://127.0.0.1:${address.port}/api/v1/videos`;
  ownerToken = await signAccessToken(ownerId, ownerSession);
  foreignToken = await signAccessToken(foreignId, foreignSession);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const body = { fileName: 'demo.mp4', contentType: 'video/mp4', sizeBytes: '1024' };
function request(id: string, input: unknown, token?: string) {
  return fetch(`${endpoint}/${id}/uploads`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(input),
  });
}

test('JWT, video UUID and strict upload metadata are required', async () => {
  const count = calls.length;
  assert.equal((await request(videoId, body)).status, 401);
  assert.equal((await request('not-a-uuid', body, ownerToken)).status, 422);
  assert.equal(
    (await request(videoId, { ...body, storageKey: 'arbitrary' }, ownerToken)).status,
    422,
  );
  assert.equal((await request(videoId, { ...body, sizeBytes: '1.5' }, ownerToken)).status, 422);
  assert.equal(calls.length, count);
});

test('owner receives only session metadata, not secret S3 URL/key', async () => {
  const response = await request(videoId, body, ownerToken);
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const payload = (await response.json()) as { success: boolean; data: Record<string, unknown> };
  assert.equal(payload.success, true);
  assert.equal(payload.data.status, 'INITIATED');
  assert.ok(!JSON.stringify(payload).includes('storageKey'));
  assert.ok(!JSON.stringify(payload).includes('uploadUrl'));
  assert.deepEqual(calls.at(-1), { videoId, ownerId });
});

test('foreign and nonexistent videos are indistinguishable', async () => {
  const foreign = await request(videoId, body, foreignToken);
  const missing = await request(randomUUID(), body, ownerToken);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  const f = (await foreign.json()) as { error: { code: string } };
  const m = (await missing.json()) as { error: { code: string } };
  assert.equal(f.error.code, m.error.code);
});
