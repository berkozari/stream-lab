import { prisma } from '../config/database.js';
import { AppError } from '../utils/app-error.js';

export type UploadToComplete = {
  uploadMode?: 'SINGLE' | 'MULTIPART';
  uploadId: string;
  videoId: string;
  expectedSizeBytes: bigint;
  checksumSha256: string | null;
};

/** Never discloses whether a missing upload is another user's upload. */
export async function getOwnedUploadToComplete(
  uploadId: string,
  ownerId: string,
): Promise<UploadToComplete> {
  const record = await prisma.videoUpload.findFirst({
    where: { id: uploadId, video: { ownerId, deletedAt: null } },
    select: {
      id: true,
      videoId: true,
      uploadMode: true,
      storageUploadId: true,
      status: true,
      expiresAt: true,
      expectedSizeBytes: true,
      checksum: true,
      video: { select: { status: true } },
    },
  });
  if (!record) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
  if (record.expiresAt <= new Date())
    throw new AppError(410, 'UPLOAD_EXPIRED', 'Upload session expired');
  if (
    !(
      record.uploadMode === 'SINGLE' ||
      (record.uploadMode === 'MULTIPART' && record.storageUploadId === null)
    ) ||
    !['INITIATED', 'UPLOADING'].includes(record.status) ||
    record.video.status !== 'UPLOADING'
  ) {
    throw new AppError(409, 'UPLOAD_NOT_COMPLETABLE', 'Upload cannot be completed');
  }
  return {
    uploadId: record.id,
    videoId: record.videoId,
    expectedSizeBytes: record.expectedSizeBytes,
    checksumSha256: record.checksum,
    uploadMode: record.uploadMode,
  };
}

/** S3 IO must occur OUTSIDE this transaction. Only one concurrent complete can win. */
export async function finalizeOwnedUpload(
  upload: UploadToComplete,
  ownerId: string,
  verified: { storageKey: string; contentType: 'video/mp4' | 'video/webm'; sizeBytes: bigint },
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const now = new Date();
    // Updating the video first acquires its row lock, aligning with session creation.
    const video = await tx.video.updateMany({
      where: {
        id: upload.videoId,
        ownerId,
        deletedAt: null,
        status: 'UPLOADING',
      },
      data: { status: 'UPLOADED', visibility: 'PRIVATE' },
    });
    if (video.count !== 1) throw new AppError(409, 'VIDEO_STATE_CHANGED', 'Video state changed');
    const session = await tx.videoUpload.updateMany({
      where: {
        id: upload.uploadId,
        videoId: upload.videoId,
        uploadMode: upload.uploadMode ?? 'SINGLE',
        ...(upload.uploadMode === 'MULTIPART' ? { storageUploadId: null } : {}),
        status: { in: ['INITIATED', 'UPLOADING'] },
        expiresAt: { gt: now },
      },
      data: { status: 'VERIFIED', completedAt: now },
    });
    if (session.count !== 1)
      throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Upload state changed');
    await tx.mediaAsset.create({
      data: {
        videoId: upload.videoId,
        kind: 'ORIGINAL',
        storageKey: verified.storageKey,
        contentType: verified.contentType,
        sizeBytes: verified.sizeBytes,
      },
    });
  });
}
