import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { CreateUploadRequestSchema, UPLOAD_LIMITS } from '@streamlab/contracts';
import { createUploadSessionService } from '../../src/services/upload-session.service.js';

const videoId = randomUUID();
const ownerId = randomUUID();
const id = randomUUID();
const input = CreateUploadRequestSchema.parse({
  fileName: 'example.mp4',
  contentType: 'video/mp4',
  sizeBytes: '1024',
});

test('session response is strict and contains no presigned URL, storage key or owner ID', async () => {
  let recorded: unknown;
  const handler = createUploadSessionService(async (...args) => {
    recorded = args;
    return {
      id,
      videoId,
      status: 'INITIATED',
      uploadMode: 'SINGLE',
      expiresAt: new Date('2026-12-01T00:00:00.000Z'),
    };
  });
  const result = await handler(videoId, ownerId, input);
  assert.deepEqual(recorded, [videoId, ownerId, input]);
  assert.deepEqual(result, {
    uploadId: id,
    videoId,
    mode: 'SINGLE',
    status: 'INITIATED',
    expiresAt: '2026-12-01T00:00:00.000Z',
  });
  assert.ok(!JSON.stringify(result).includes('storageKey'));
  assert.ok(!JSON.stringify(result).includes('uploadUrl'));
});

test('100 MiB is accepted while >100 MiB is rejected before writer is invoked', async () => {
  let writes = 0;
  const handler = createUploadSessionService(async () => {
    writes += 1;
    return { id, videoId, status: 'INITIATED', uploadMode: 'SINGLE', expiresAt: new Date() };
  });
  await handler(videoId, ownerId, {
    ...input,
    sizeBytes: String(UPLOAD_LIMITS.singlePutLimitBytes),
  });
  await assert.rejects(
    handler(videoId, ownerId, {
      ...input,
      sizeBytes: String(UPLOAD_LIMITS.singlePutLimitBytes + 1),
    }),
    (error: unknown) => error instanceof Error && error.message.includes('multipart'),
  );
  assert.equal(writes, 1);
});
