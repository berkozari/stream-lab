import { prisma } from '../src/config/database.js';
import { createUploadStorageService } from '../src/services/storage.service.js';
import { createMultipartStorage } from '../src/services/upload-multipart-storage.service.js';
import { createUploadVerificationStorage } from '../src/services/upload-verify-storage.service.js';

/** Only generated STREAM-004.9 identities may be deleted. Never use this on a real user. */
const email = process.argv[2];
const expected =
  /^streamlab-upload-e2e-[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}@example\.invalid$/u;
if (!email || !expected.test(email)) {
  throw new Error('Refused: expected streamlab-upload-e2e-<uuid>@example.invalid');
}

const errors: string[] = [];
try {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const videos = await prisma.video.findMany({
      where: { ownerId: user.id },
      select: { id: true },
    });
    const ids = videos.map((video) => video.id);
    if (ids.length) {
      const uploads = await prisma.videoUpload.findMany({
        where: { videoId: { in: ids } },
        select: { id: true, videoId: true, storageUploadId: true, uploadMode: true },
      });
      const assets = await prisma.mediaAsset.findMany({
        where: { videoId: { in: ids }, kind: 'ORIGINAL' },
        select: { storageKey: true },
      });
      if (uploads.length || assets.length) {
        const staging = createUploadStorageService();
        const multipart = uploads.some(
          (item) => item.uploadMode === 'MULTIPART' && item.storageUploadId,
        )
          ? createMultipartStorage()
          : null;
        for (const upload of uploads) {
          try {
            if (upload.uploadMode === 'MULTIPART' && upload.storageUploadId) {
              await multipart?.abort({
                videoId: upload.videoId,
                uploadId: upload.id,
                storageUploadId: upload.storageUploadId,
              });
            }
            await staging.deleteStaging({ videoId: upload.videoId, uploadId: upload.id });
          } catch (error) {
            errors.push(`staging ${upload.id}: ${String(error)}`);
          }
        }
        if (assets.length) {
          const verified = createUploadVerificationStorage();
          for (const asset of assets) {
            try {
              await verified.removeVerified(asset.storageKey);
            } catch (error) {
              errors.push(`original cleanup: ${String(error)}`);
            }
          }
        }
      }
    }
    // Mirror STREAM-003.9 cleanup: deleting child records before videos/user.
    await prisma.$transaction(async (tx) => {
      await tx.watchProgress.deleteMany({ where: { userId: user.id } });
      if (ids.length) {
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
  if (errors.length) {
    throw new Error(`Upload storage cleanup requires attention: ${errors.join('; ')}`);
  }
  console.log(`PASS: STREAM-004.9 E2E cleanup (${email})`);
} finally {
  await prisma.$disconnect();
}
