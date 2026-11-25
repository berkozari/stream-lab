// Run this legacy signature-only upload smoke while API/worker are STOPPED.
// Its synthetic bytes are not decodable by FFmpeg. Use smoke:transcoding:e2e for live pipeline.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { insertOwnedUploadSession } from '../src/repositories/upload-session.repository.js';
import { signUpload } from '../src/services/upload-sign.service.js';
import { completeUpload } from '../src/services/upload-complete.service.js';
import { createUploadStorageService } from '../src/services/storage.service.js';
import { createUploadVerificationStorage } from '../src/services/upload-verify-storage.service.js';

const email = `streamlab-complete-smoke-${randomUUID()}@example.invalid`;
// A minimal MP4 ftyp signature probe; complete verifies a signature, NOT full decoding.
const bytes = Buffer.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
]);
const checksum = createHash('sha256').update(bytes).digest('hex');
const staging = createUploadStorageService();
const verifiedStorage = createUploadVerificationStorage();
let userId: string | undefined;
let videoId: string | undefined;
let uploadId: string | undefined;
let originalKey: string | undefined;

try {
  const user = await prisma.user.create({
    data: {
      email,
      displayName: 'Complete Upload Smoke',
      passwordHash: 'smoke-only-not-a-password',
    },
    select: { id: true },
  });
  userId = user.id;
  const video = await prisma.video.create({
    data: { ownerId: user.id, title: 'Complete upload smoke' },
    select: { id: true },
  });
  videoId = video.id;
  const upload = await insertOwnedUploadSession(video.id, user.id, {
    fileName: 'probe.mp4',
    contentType: 'video/mp4',
    sizeBytes: String(bytes.length),
    checksumSha256: checksum,
  });
  uploadId = upload.id;
  const signed = await signUpload(upload.id, user.id, { contentType: 'video/mp4' });
  const put = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: signed.headers,
    body: bytes,
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(put.ok, `Staging PUT failed: ${put.status}`);
  const result = await completeUpload(upload.id, user.id);
  assert.deepEqual(result, { videoId: video.id, uploadId: upload.id, status: 'QUEUED' });
  const [storedUpload, storedVideo, original] = await Promise.all([
    prisma.videoUpload.findUnique({ where: { id: upload.id } }),
    prisma.video.findUnique({ where: { id: video.id } }),
    prisma.mediaAsset.findFirst({ where: { videoId: video.id, kind: 'ORIGINAL' } }),
  ]);
  assert.equal(storedUpload?.status, 'VERIFIED');
  assert.ok(storedUpload?.completedAt);
  assert.equal(storedVideo?.processingVersion, 1);
  assert.notEqual(storedVideo?.status, 'UPLOADED');
  assert.equal(await prisma.videoTranscodeOutbox.count({ where: { videoId: video.id } }), 1);
  assert.equal(storedVideo?.visibility, 'PRIVATE');
  assert.ok(original);
  originalKey = original.storageKey;
  assert.equal(original.contentType, 'video/mp4');
  assert.equal(original.sizeBytes, BigInt(bytes.length));
  await assert.rejects(completeUpload(upload.id, user.id), /cannot be completed/i);
} finally {
  // Delete created data only; a failed cleanup makes the smoke run fail.
  try {
    if (originalKey) await verifiedStorage.removeVerified(originalKey);
    if (videoId && uploadId) await staging.deleteStaging({ videoId, uploadId });
  } catch (error) {
    console.error('Storage smoke cleanup failed', error);
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
    'PASS: direct PUT -> streaming SHA256/signature -> conditional copy -> verified original -> QUEUED + durable outbox',
  );
}
