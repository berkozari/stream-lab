import { prisma } from '../src/config/database.js';

/** Delete only accounts created by STREAM-003.9 browser tests. No wildcard cleanup. */
const email = process.argv[2];
const expected =
  /^streamlab-video-e2e-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}@example\.invalid$/u;
if (!email || !expected.test(email)) {
  throw new Error('Refused: expected streamlab-video-e2e-<uuid>@example.invalid');
}

try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await prisma.$transaction(async (tx) => {
      const videos = await tx.video.findMany({ where: { ownerId: user.id }, select: { id: true } });
      const ids = videos.map((video) => video.id);
      await tx.watchProgress.deleteMany({ where: { userId: user.id } });
      if (ids.length > 0) {
        await tx.watchProgress.deleteMany({ where: { videoId: { in: ids } } });
        await tx.videoCategory.deleteMany({ where: { videoId: { in: ids } } });
        await tx.videoUpload.deleteMany({ where: { videoId: { in: ids } } });
        await tx.videoRendition.deleteMany({ where: { videoId: { in: ids } } });
        await tx.mediaAsset.deleteMany({ where: { videoId: { in: ids } } });
        await tx.video.deleteMany({ where: { ownerId: user.id } });
      }
      await tx.consumedRefreshToken.deleteMany({ where: { session: { userId: user.id } } });
      await tx.authSession.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });
  }
  console.log(`PASS: video E2E cleanup (${email})`);
} finally {
  await prisma.$disconnect();
}
