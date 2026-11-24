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
let signCalls = 0;

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
    uploadSign: async (id, uid, input) => {
      signCalls += 1;
      if (id !== uploadId || uid !== ownerId) {
        throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
      }
      return {
        uploadId: id,
        videoId,
        mode: 'SINGLE',
        method: 'PUT',
        uploadUrl: 'http://127.0.0.1:9000/bucket/key?X-Amz-Signature=secret',
        headers: { 'Content-Type': input.contentType },
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
      };
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

function request(id: string, body: unknown, token?: string) {
  return fetch(`${endpoint}/${id}/sign`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

test('active JWT and strict input are required before signing', async () => {
  const initial = signCalls;
  assert.equal((await request(uploadId, { contentType: 'video/mp4' })).status, 401);
  assert.equal((await request('not-uuid', { contentType: 'video/mp4' }, ownerToken)).status, 422);
  assert.equal((await request(uploadId, { contentType: 'video/avi' }, ownerToken)).status, 422);
  assert.equal(
    (await request(uploadId, { contentType: 'video/mp4', storageKey: 'malicious' }, ownerToken))
      .status,
    422,
  );
  assert.equal(signCalls, initial);
});

test('owner receives no-store signed PUT capability; foreign and missing uploads return 404', async () => {
  const response = await request(uploadId, { contentType: 'video/webm' }, ownerToken);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  const payload = (await response.json()) as { data: Record<string, unknown> };
  assert.equal(payload.data.method, 'PUT');
  assert.equal(payload.data.mode, 'SINGLE');
  assert.equal((payload.data.headers as Record<string, string>)['Content-Type'], 'video/webm');
  assert.ok(!JSON.stringify(payload).includes('storageKey'));
  assert.ok(!JSON.stringify(payload).includes('secretAccessKey'));

  const foreign = await request(uploadId, { contentType: 'video/webm' }, foreignToken);
  const missing = await request(randomUUID(), { contentType: 'video/webm' }, ownerToken);
  assert.equal(foreign.status, 404);
  assert.equal(missing.status, 404);
  const f = (await foreign.json()) as { error: { code: string } };
  const m = (await missing.json()) as { error: { code: string } };
  assert.equal(f.error.code, m.error.code);
});
