import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/config/database.js';
import { insertOwnedUploadSession } from '../src/repositories/upload-session.repository.js';

const email = `streamlab-upload-smoke-${randomUUID()}@example.invalid`;
const input = { fileName: 'session.mp4', contentType: 'video/mp4', sizeBytes: '4096' } as const;
let userId: string | undefined;
let videoId: string | undefined;

try {
  const user = await prisma.user.create({
    data: { email, displayName: 'Upload Session Smoke', passwordHash: 'smoke-only-not-a-password' },
    select: { id: true },
  });
  userId = user.id;
  const video = await prisma.video.create({
    data: { ownerId: user.id, title: 'Upload session smoke' },
    select: { id: true },
  });
  videoId = video.id;

  const results = await Promise.allSettled([
    insertOwnedUploadSession(video.id, user.id, input),
    insertOwnedUploadSession(video.id, user.id, input),
  ]);
  const successes = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(successes.length, 1, 'Only one active upload session may be created');
  assert.equal(rejected.length, 1);
  const winner = successes[0];
  assert.ok(winner && winner.status === 'fulfilled');
  assert.equal(winner.value.status, 'INITIATED');

  const active = await prisma.videoUpload.findMany({
    where: { videoId: video.id, status: { in: ['INITIATED', 'UPLOADING'] } },
  });
  assert.equal(active.length, 1);
  assert.equal(active[0]?.storageKey, `staging/${video.id}/${winner.value.id}/source`);
  assert.equal(active[0]?.expectedSizeBytes, 4096n);
  const ttlMs = (active[0]?.expiresAt.getTime() ?? 0) - Date.now();
  assert.ok(ttlMs > 86_370_000 && ttlMs <= 86_400_000, 'Upload session must expire after 24 hours');
  assert.equal((await prisma.video.findUnique({ where: { id: video.id } }))?.status, 'UPLOADING');

  await prisma.videoUpload.update({
    where: { id: winner.value.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const retry = await insertOwnedUploadSession(video.id, user.id, input);
  assert.notEqual(retry.id, winner.value.id);
  assert.equal(
    (await prisma.videoUpload.findUnique({ where: { id: winner.value.id } }))?.status,
    'EXPIRED',
  );
  console.log(
    'PASS: owner session -> one concurrent winner -> 24h TTL -> stale expiration -> safe retry',
  );
} finally {
  if (videoId) await prisma.videoUpload.deleteMany({ where: { videoId } });
  if (videoId) await prisma.video.deleteMany({ where: { id: videoId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.$disconnect();
}
