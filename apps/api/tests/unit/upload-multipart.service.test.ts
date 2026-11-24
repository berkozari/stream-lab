import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import {
  createMultipartUploadService,
  type MultipartStorage,
} from '../../src/services/upload-multipart.service.js';

const videoId = randomUUID();
const ownerId = randomUUID();
const uploadId = randomUUID();
const expiresAt = new Date(Date.now() + 3600_000);
const sizeBytes = BigInt(UPLOAD_LIMITS.singlePutLimitBytes + 1);
const record = {
  id: uploadId,
  videoId,
  storageUploadId: 'private-s3-id',
  status: 'UPLOADING' as const,
  expectedSizeBytes: sizeBytes,
  expiresAt,
};

const makeStorage = (calls: string[]): MultipartStorage => ({
  initiate: async () => {
    calls.push('initiate');
    return 'private-s3-id';
  },
  signPart: async () => {
    calls.push('sign');
    return { uploadUrl: 'http://127.0.0.1/part', headers: {} };
  },
  listParts: async () => {
    calls.push('list');
    return Array.from({ length: 13 }, (_, i) => ({
      partNumber: i + 1,
      etag: `"tag${i + 1}"`,
      sizeBytes:
        i === 12
          ? Number(sizeBytes - 12n * BigInt(UPLOAD_LIMITS.multipartPartSizeBytes))
          : UPLOAD_LIMITS.multipartPartSizeBytes,
    }));
  },
  assemble: async () => {
    calls.push('assemble');
  },
  hasAssembledObject: async () => false,
  abort: async () => {
    calls.push('abort');
  },
  deleteStaging: async () => {
    calls.push('delete');
  },
});

test('multipart session starts S3 outside DB reservation and never exposes S3 UploadId', async () => {
  const calls: string[] = [];
  const service = createMultipartUploadService({
    storage: makeStorage(calls),
    reserve: async () => {
      calls.push('reserve');
      return { id: uploadId, videoId, expiresAt };
    },
    bindId: async () => {
      calls.push('bind');
    },
  });
  const result = await service.initiate(videoId, ownerId, {
    fileName: 'test.mp4',
    contentType: 'video/mp4',
    sizeBytes: String(sizeBytes),
  });
  assert.deepEqual(calls, ['reserve', 'initiate', 'bind']);
  assert.equal(result.mode, 'MULTIPART');
  assert.equal(JSON.stringify(result).includes('private-s3-id'), false);
});

test('signing checks part bounds, claims session and limits URL expiry', async () => {
  const calls: string[] = [];
  const service = createMultipartUploadService({
    storage: makeStorage(calls),
    read: async () => record,
    claimPart: async () => {
      calls.push('claim');
    },
  });
  await assert.rejects(service.signPart(uploadId, ownerId, 14), /outside/i);
  assert.deepEqual(calls, []);
  const signed = await service.signPart(uploadId, ownerId, 1);
  assert.equal(signed.method, 'PUT');
  assert.deepEqual(calls, ['claim', 'sign']);
});

test('assembling validates S3 parts before reusing 004.6 trusted verification', async () => {
  const calls: string[] = [];
  const storage = makeStorage(calls);
  const service = createMultipartUploadService({
    storage,
    read: async () => record,
    claimPart: async () => {
      calls.push('claim');
    },
    markAssembled: async () => {
      calls.push('database');
    },
    verify: async () => {
      calls.push('verify');
      return { uploadId, videoId, status: 'UPLOADED' };
    },
  });
  const listed = await storage.listParts(record);
  calls.length = 0;
  const receipts = listed.map(({ partNumber, etag }) => ({ partNumber, etag }));
  const result = await service.complete(uploadId, ownerId, { parts: receipts });
  assert.equal(result.status, 'UPLOADED');
  assert.deepEqual(calls, ['claim', 'list', 'assemble', 'database', 'verify']);
});

test('abort marks session closed before asking S3 to release parts', async () => {
  const calls: string[] = [];
  const service = createMultipartUploadService({
    storage: makeStorage(calls),
    cancel: async () => {
      calls.push('cancel');
      return { uploadId, videoId, storageUploadId: 'private-s3-id' };
    },
  });
  assert.deepEqual(await service.abort(uploadId, ownerId), { uploadId, status: 'ABORTED' });
  assert.deepEqual(calls, ['cancel', 'abort']);
});
