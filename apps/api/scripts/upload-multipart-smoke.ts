// Run this legacy signature-only upload smoke while API/worker are STOPPED.
// Its synthetic bytes are not decodable by FFmpeg. Use smoke:transcoding:e2e for live pipeline.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import { prisma } from '../src/config/database.js';
import { multipartUpload } from '../src/services/upload-multipart.service.js';
import { createUploadStorageService } from '../src/services/storage.service.js';
import { createUploadVerificationStorage } from '../src/services/upload-verify-storage.service.js';

const email = `streamlab-multipart-${randomUUID()}@example.invalid`;
const size = UPLOAD_LIMITS.singlePutLimitBytes + 1;
const partSize = UPLOAD_LIMITS.multipartPartSizeBytes;
const count = Math.ceil(size / partSize);
const staging = createUploadStorageService();
const verified = createUploadVerificationStorage();
let userId: string | undefined;
let videoId: string | undefined;
let uploadId: string | undefined;
let originalKey: string | undefined;

function bytesForPart(partNumber: number): Buffer {
  const start = (partNumber - 1) * partSize;
  const bytes = Buffer.alloc(Math.min(partSize, size - start));
  if (partNumber === 1) {
    Buffer.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]).copy(bytes);
  }
  return bytes;
}

try {
  const digest = createHash('sha256');
  for (let partNumber = 1; partNumber <= count; partNumber++)
    digest.update(bytesForPart(partNumber));
  const checksumSha256 = digest.digest('hex');
  const user = await prisma.user.create({
    data: { email, displayName: 'Multipart Smoke', passwordHash: 'smoke-test-only' },
    select: { id: true },
  });
  userId = user.id;
  const video = await prisma.video.create({
    data: { ownerId: user.id, title: 'Multipart smoke' },
    select: { id: true },
  });
  videoId = video.id;
  const session = await multipartUpload.initiate(video.id, user.id, {
    fileName: 'large.mp4',
    contentType: 'video/mp4',
    sizeBytes: String(size),
    checksumSha256,
  });
  uploadId = session.uploadId;
  assert.equal(session.mode, 'MULTIPART');
  const receipts: Array<{ partNumber: number; etag: string }> = [];
  for (let partNumber = 1; partNumber <= count; partNumber++) {
    const signed = await multipartUpload.signPart(session.uploadId, user.id, partNumber);
    const put = await fetch(signed.uploadUrl, {
      method: 'PUT',
      body: bytesForPart(partNumber),
      headers: signed.headers,
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(put.status, 200, `S3 upload part ${partNumber} failed`);
    const etag = put.headers.get('etag');
    assert.ok(etag, `Missing ETag for part ${partNumber}`);
    receipts.push({ partNumber, etag });
  }
  const recovered = await multipartUpload.listParts(session.uploadId, user.id);
  assert.equal(recovered.parts.length, count);
  const result = await multipartUpload.complete(session.uploadId, user.id, { parts: receipts });
  assert.deepEqual(result, { videoId: video.id, uploadId: session.uploadId, status: 'QUEUED' });
  const [upload, storedVideo, original] = await Promise.all([
    prisma.videoUpload.findUnique({ where: { id: session.uploadId } }),
    prisma.video.findUnique({ where: { id: video.id } }),
    prisma.mediaAsset.findFirst({ where: { videoId: video.id, kind: 'ORIGINAL' } }),
  ]);
  assert.equal(upload?.status, 'VERIFIED');
  assert.equal(upload?.storageUploadId, null);
  assert.equal(storedVideo?.processingVersion, 1);
  assert.notEqual(storedVideo?.status, 'UPLOADED');
  assert.equal(await prisma.videoTranscodeOutbox.count({ where: { videoId: video.id } }), 1);
  assert.ok(original);
  originalKey = original.storageKey;
  assert.equal(original.sizeBytes, BigInt(size));
  await assert.rejects(
    multipartUpload.signPart(session.uploadId, user.id, 1),
    /not active|state|cannot/i,
  );
} finally {
  try {
    if (uploadId && userId) {
      const current = await prisma.videoUpload.findUnique({ where: { id: uploadId } });
      if (current && ['INITIATED', 'UPLOADING'].includes(current.status)) {
        try {
          await multipartUpload.abort(uploadId, userId);
        } catch (error) {
          console.error('Failed to abort test upload', error);
          process.exitCode = 1;
        }
      }
    }
    if (originalKey) await verified.removeVerified(originalKey);
    if (videoId && uploadId) await staging.deleteStaging({ videoId, uploadId });
  } catch (error) {
    console.error('Storage cleanup failed', error);
    process.exitCode = 1;
  }
  try {
    if (videoId) await prisma.videoTranscodeOutbox.deleteMany({ where: { videoId } });
    if (videoId) await prisma.videoRendition.deleteMany({ where: { videoId } });
    if (videoId) await prisma.mediaAsset.deleteMany({ where: { videoId } });
    if (videoId) await prisma.videoUpload.deleteMany({ where: { videoId } });
    if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    await prisma.$disconnect();
  }
}
if (process.exitCode !== 1) {
  console.log(
    'PASS: MULTIPART 13 parts -> S3 recovery -> assembled -> SHA256/verified original -> QUEUED + durable outbox',
  );
}
