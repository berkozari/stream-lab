import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { before, after, test } from 'node:test';
import { createApp } from '../../src/app.js';
import { signAccessToken } from '../../src/lib/auth-security.js';
import { createRequireAuth } from '../../src/middlewares/auth.middleware.js';
import { AppError } from '../../src/utils/app-error.js';
import type { MultipartUploadService } from '../../src/services/upload-multipart.service.js';

process.env.AUTH_ACCESS_TOKEN_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_REFRESH_TOKEN_HMAC_SECRET ??= randomBytes(32).toString('base64url');
process.env.AUTH_CSRF_SECRET ??= randomBytes(32).toString('base64url');

const ownerId = randomUUID();
const otherId = randomUUID();
const ownerSid = randomUUID();
const otherSid = randomUUID();
const videoId = randomUUID();
const uploadId = randomUUID();
let ownerToken: string;
let otherToken: string;
let server: Server;
let base: string;
const calls: string[] = [];

const mockMultipart = {
  initiate: async (id: string, userId: string) => {
    calls.push('initiate');
    if (id !== videoId || userId !== ownerId)
      throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    return {
      uploadId,
      videoId,
      mode: 'MULTIPART' as const,
      partSizeBytes: 8_388_608,
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  },
  signPart: async (id: string, userId: string, number: number) => {
    calls.push('sign');
    if (id !== uploadId || userId !== ownerId)
      throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
    return {
      partNumber: number,
      method: 'PUT' as const,
      uploadUrl: 'https://storage.invalid/part',
      headers: {},
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
  },
  listParts: async (id: string, userId: string) => {
    calls.push('list');
    if (id !== uploadId || userId !== ownerId)
      throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
    return { uploadId, partSizeBytes: 8_388_608, expectedPartCount: 13, parts: [] };
  },
  complete: async (id: string, userId: string) => {
    calls.push('complete');
    if (id !== uploadId || userId !== ownerId)
      throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
    return { uploadId, videoId, status: 'UPLOADED' as const };
  },
  abort: async (id: string, userId: string) => {
    calls.push('abort');
    if (id !== uploadId || userId !== ownerId)
      throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
    return { uploadId, status: 'ABORTED' as const };
  },
} as MultipartUploadService;

before(async () => {
  const app = createApp({
    authenticate: createRequireAuth(async (sid, userId) => {
      const valid =
        (sid === ownerSid && userId === ownerId) || (sid === otherSid && userId === otherId);
      return valid
        ? {
            id: sid,
            user: {
              id: userId,
              email: 'user@example.invalid',
              displayName: 'Test',
              role: 'USER',
              createdAt: new Date(),
            },
          }
        : null;
    }),
    uploadMultipart: mockMultipart,
    videoMultipartCreate: mockMultipart.initiate,
  });
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  base = `http://127.0.0.1:${address.port}/api/v1`;
  ownerToken = await signAccessToken(ownerId, ownerSid);
  otherToken = await signAccessToken(otherId, otherSid);
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function request(path: string, method: string, payload?: unknown, token?: string) {
  return fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(payload ? { 'content-type': 'application/json' } : {}),
    },
    ...(payload ? { body: JSON.stringify(payload) } : {}),
  });
}
const createBody = { fileName: 'large.mp4', contentType: 'video/mp4', sizeBytes: '104857601' };

test('multipart creation requires JWT, an owned video and more than 100 MiB', async () => {
  const url = `/videos/${videoId}/uploads/multipart`;
  assert.equal((await request(url, 'POST', createBody)).status, 401);
  assert.equal((await request(url, 'POST', createBody, otherToken)).status, 404);
  assert.equal(
    (await request(url, 'POST', { ...createBody, sizeBytes: '100' }, ownerToken)).status,
    422,
  );
  assert.equal(
    (await request(url, 'POST', { ...createBody, storageUploadId: 'leak' }, ownerToken)).status,
    422,
  );
  const created = await request(url, 'POST', createBody, ownerToken);
  assert.equal(created.status, 201);
  assert.equal(created.headers.get('cache-control'), 'no-store');
  assert.ok(!JSON.stringify(await created.json()).includes('storageUploadId'));
});

test('part signing and resume require owned upload, and reject bad part number', async () => {
  const path = `/uploads/${uploadId}/parts/sign`;
  const before = calls.length;
  assert.equal((await request(path, 'POST', { partNumber: 1 })).status, 401);
  assert.equal((await request(path, 'POST', { partNumber: 0 }, ownerToken)).status, 422);
  assert.equal((await request(path, 'POST', { partNumber: 1 }, otherToken)).status, 404);
  assert.equal(
    (await request(`/uploads/${uploadId}/parts`, 'GET', undefined, ownerToken)).status,
    200,
  );
  assert.deepEqual(calls.slice(before), ['sign', 'list']);
});

test('multipart completion is validated, and abort is owner-only', async () => {
  assert.equal(
    (await request(`/uploads/${uploadId}/multipart/complete`, 'POST', { parts: [] }, ownerToken))
      .status,
    422,
  );
  const parts = Array.from({ length: 13 }, (_, i) => ({
    partNumber: i + 1,
    etag: `"tag${i + 1}"`,
  }));
  const completed = await request(
    `/uploads/${uploadId}/multipart/complete`,
    'POST',
    { parts },
    ownerToken,
  );
  assert.equal(completed.status, 200);
  assert.equal(
    (await request(`/uploads/${uploadId}/multipart`, 'DELETE', undefined, otherToken)).status,
    404,
  );
  assert.equal(
    (await request(`/uploads/${uploadId}/multipart`, 'DELETE', undefined, ownerToken)).status,
    200,
  );
});
