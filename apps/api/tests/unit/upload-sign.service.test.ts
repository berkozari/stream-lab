import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { SignUploadRequestSchema, UPLOAD_LIMITS } from '@streamlab/contracts';
import {
  createSignUploadService,
  type SignUploadStorage,
} from '../../src/services/upload-sign.service.js';

const uploadId = randomUUID();
const videoId = randomUUID();
const ownerId = randomUUID();
const fixedNow = Date.parse('2026-11-24T10:00:00.000Z');
const signedUrl = 'http://127.0.0.1:9000/streamlab-uploads/staging/example?X-Amz-Signature=secret';

const signer: SignUploadStorage = async (input) => ({
  method: 'PUT',
  url: signedUrl,
  headers: { 'Content-Type': input.contentType },
  expiresInSeconds: input.expiresInSeconds ?? UPLOAD_LIMITS.presignedUrlTtlSeconds,
});

function reader(expiresAt: number, checksumSha256: string | null = null) {
  return async (id: string, owner: string) => {
    assert.equal(id, uploadId);
    assert.equal(owner, ownerId);
    return { uploadId: id, videoId, expiresAt: new Date(expiresAt), checksumSha256 };
  };
}

test('sign service binds authorized session, signed content type, checksum and 600s TTL', async () => {
  let signedInput: Parameters<SignUploadStorage>[0] | undefined;
  const result = await createSignUploadService(
    reader(fixedNow + 1000_000, 'a'.repeat(64)),
    async (input) => {
      signedInput = input;
      return signer(input);
    },
    () => fixedNow,
  )(uploadId, ownerId, SignUploadRequestSchema.parse({ contentType: 'video/webm' }));
  assert.equal(result.mode, 'SINGLE');
  assert.equal(result.method, 'PUT');
  assert.equal(result.uploadUrl, signedUrl);
  assert.deepEqual(signedInput, {
    uploadId,
    videoId,
    contentType: 'video/webm',
    checksumSha256: 'a'.repeat(64),
    expiresInSeconds: 600,
  });
  assert.equal(result.expiresAt, new Date(fixedNow + 600_000).toISOString());
});

test('presigned URL never outlives the active upload session', async () => {
  let ttl = 0;
  const sign = createSignUploadService(
    reader(fixedNow + 75_500),
    async (input) => {
      ttl = input.expiresInSeconds ?? 0;
      return signer(input);
    },
    () => fixedNow,
  );
  const response = await sign(uploadId, ownerId, { contentType: 'video/mp4' });
  assert.equal(ttl, 75);
  assert.equal(response.expiresAt, new Date(fixedNow + 75_000).toISOString());
});

test('expired sessions fail without invoking the storage signer', async () => {
  let called = false;
  const sign = createSignUploadService(
    reader(fixedNow - 1),
    async (input) => {
      called = true;
      return signer(input);
    },
    () => fixedNow,
  );
  await assert.rejects(sign(uploadId, ownerId, { contentType: 'video/mp4' }), /expired/i);
  assert.equal(called, false);
});

test('sign request schema rejects unknown fields and disallowed MIME types', () => {
  for (const input of [
    {},
    { contentType: 'application/octet-stream' },
    { contentType: 'video/mp4', storageKey: 'evil' },
  ]) {
    assert.equal(SignUploadRequestSchema.safeParse(input).success, false);
  }
});
