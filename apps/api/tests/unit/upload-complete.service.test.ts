import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AppError } from '../../src/utils/app-error.js';
import { verifyUploadBytes, sniffVideoContent } from '../../src/lib/upload-content.js';
import {
  createCompleteUploadService,
  type CompleteUploadStorage,
} from '../../src/services/upload-complete.service.js';

const videoId = randomUUID();
const uploadId = randomUUID();
const ownerId = randomUUID();
const mp4 = Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const hash = createHash('sha256').update(mp4).digest('hex');
const session = { uploadId, videoId, expectedSizeBytes: BigInt(mp4.length), checksumSha256: hash };

async function* chunks(...parts: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const part of parts) yield part;
}

test('bounded byte stream validates MP4 and SHA-256 across chunk boundaries', async () => {
  const result = await verifyUploadBytes(
    chunks(mp4.subarray(0, 3), mp4.subarray(3)),
    BigInt(mp4.length),
    hash,
  );
  assert.equal(result.sizeBytes, BigInt(mp4.length));
  assert.equal(result.contentType, 'video/mp4');
  assert.equal(result.sha256Hex, hash);
  assert.equal(sniffVideoContent(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), 'video/webm');
});

test('invalid signatures, oversized bytes and checksum mismatches are rejected', async () => {
  await assert.rejects(
    verifyUploadBytes(chunks(Buffer.alloc(mp4.length)), BigInt(mp4.length)),
    /signature/i,
  );
  await assert.rejects(verifyUploadBytes(chunks(mp4), BigInt(mp4.length - 1)), /size|exceed/i);
  await assert.rejects(verifyUploadBytes(chunks(mp4), BigInt(mp4.length + 1)), /count/i);
  await assert.rejects(
    verifyUploadBytes(chunks(mp4), BigInt(mp4.length), 'a'.repeat(64)),
    /checksum/i,
  );
  await assert.rejects(verifyUploadBytes(chunks(mp4), 0n), /size/i);
});

test('completion persists only after verification and returns a minimal DTO', async () => {
  const actions: string[] = [];
  const original = {
    storageKey: `originals/${videoId}/${uploadId}/${randomUUID()}/source`,
    contentType: 'video/mp4' as const,
    sizeBytes: BigInt(mp4.length),
    sha256Hex: hash,
  };
  const storage: CompleteUploadStorage = {
    promote: async () => {
      actions.push('verify');
      return original;
    },
    removeVerified: async () => {
      actions.push('remove');
    },
  };
  const complete = createCompleteUploadService(
    async (id, userId) => {
      assert.equal(id, uploadId);
      assert.equal(userId, ownerId);
      actions.push('read');
      return session;
    },
    async (item, userId, asset) => {
      assert.equal(item.videoId, videoId);
      assert.equal(userId, ownerId);
      assert.equal(asset.storageKey, original.storageKey);
      actions.push('persist');
    },
    storage,
  );
  assert.deepEqual(await complete(uploadId, ownerId), { videoId, uploadId, status: 'UPLOADED' });
  assert.deepEqual(actions, ['read', 'verify', 'persist']);
});

test('DB concurrency failure cleans uncommitted verified copy', async () => {
  const actions: string[] = [];
  const storage: CompleteUploadStorage = {
    promote: async () => {
      actions.push('copy');
      return {
        storageKey: 'internal-key',
        contentType: 'video/mp4',
        sizeBytes: 16n,
        sha256Hex: hash,
      };
    },
    removeVerified: async (key) => {
      assert.equal(key, 'internal-key');
      actions.push('cleanup');
    },
  };
  const complete = createCompleteUploadService(
    async () => session,
    async () => {
      actions.push('commit');
      throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Concurrent completion');
    },
    storage,
  );
  await assert.rejects(complete(uploadId, ownerId), /Concurrent completion/);
  assert.deepEqual(actions, ['copy', 'commit', 'cleanup']);
});

test('failed source verification never commits database state', async () => {
  let committed = false;
  const complete = createCompleteUploadService(
    async () => session,
    async () => {
      committed = true;
    },
    {
      promote: async () => {
        throw new AppError(422, 'UPLOAD_INVALID_CONTENT', 'Invalid signature');
      },
      removeVerified: async () => {
        throw new Error('Must not cleanup a missing copy');
      },
    },
  );
  await assert.rejects(complete(uploadId, ownerId), /Invalid signature/);
  assert.equal(committed, false);
});
