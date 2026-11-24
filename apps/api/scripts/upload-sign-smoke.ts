import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { insertOwnedUploadSession } from '../src/repositories/upload-session.repository.js';
import { signUpload } from '../src/services/upload-sign.service.js';
import { createUploadStorageService } from '../src/services/storage.service.js';

const email = `streamlab-sign-smoke-${randomUUID()}@example.invalid`;
const probe = Buffer.from(`staging-connectivity-${randomUUID()}`);
const storage = createUploadStorageService();
let userId: string | undefined;
let videoId: string | undefined;
let uploadId: string | undefined;

try {
  const user = await prisma.user.create({
    data: { email, displayName: 'Upload Sign Smoke', passwordHash: 'smoke-only-not-a-password' },
    select: { id: true },
  });
  userId = user.id;
  const video = await prisma.video.create({
    data: { ownerId: user.id, title: 'Upload sign smoke' },
    select: { id: true },
  });
  videoId = video.id;
  const session = await insertOwnedUploadSession(video.id, user.id, {
    fileName: 'probe.mp4',
    contentType: 'video/mp4',
    sizeBytes: String(probe.byteLength),
  });
  uploadId = session.id;
  const result = await signUpload(session.id, user.id, { contentType: 'video/mp4' });
  assert.equal(result.method, 'PUT');
  assert.equal(result.mode, 'SINGLE');
  assert.ok(result.uploadUrl.includes('X-Amz-Signature='));
  assert.equal(result.headers['Content-Type'], 'video/mp4');
  assert.ok(Date.parse(result.expiresAt) <= session.expiresAt.getTime());
  await assert.rejects(
    signUpload(session.id, randomUUID(), { contentType: 'video/mp4' }),
    (error: unknown) => error instanceof Error && /not found/i.test(error.message),
  );
  const put = await fetch(result.uploadUrl, {
    method: 'PUT',
    headers: result.headers,
    body: probe,
    signal: AbortSignal.timeout(15_000),
  });
  assert.ok(put.ok, `Storage PUT failed with HTTP ${put.status}`);
  const head = await storage.headStaging({ videoId: video.id, uploadId: session.id });
  assert.equal(head.sizeBytes, probe.byteLength);
  assert.equal(
    (await prisma.videoUpload.findUnique({ where: { id: session.id } }))?.status,
    'UPLOADING',
  );
  console.log(
    'PASS: owner-only sign -> 10m SigV4 -> direct S3 PUT -> staging HEAD -> no completion',
  );
} finally {
  let stagingCleanupError: unknown;
  if (uploadId && videoId) {
    try {
      await storage.deleteStaging({ videoId, uploadId });
    } catch (error) {
      stagingCleanupError = error;
      console.error('Storage probe cleanup failed:', error);
    }
  }
  try {
    if (videoId) await prisma.videoUpload.deleteMany({ where: { videoId } });
    if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  } finally {
    await prisma.$disconnect();
  }
  if (stagingCleanupError !== undefined) {
    process.exitCode = 1;
  }
}
