import { UPLOAD_LIMITS } from '@streamlab/contracts';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/app-error.js';

export type SignableUpload = {
  uploadId: string;
  videoId: string;
  expiresAt: Date;
  checksumSha256: string | null;
};

/** Ownership is checked through the related Video, not a client-supplied owner ID. */
export async function claimOwnedUploadForSigning(
  uploadId: string,
  ownerId: string,
): Promise<SignableUpload> {
  const upload = await prisma.videoUpload.findFirst({
    where: { id: uploadId, video: { ownerId, deletedAt: null } },
    select: {
      id: true,
      videoId: true,
      uploadMode: true,
      status: true,
      expiresAt: true,
      checksum: true,
      expectedSizeBytes: true,
      video: { select: { status: true } },
    },
  });
  if (!upload) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
  const now = new Date();
  if (upload.expiresAt <= now) throw new AppError(410, 'UPLOAD_EXPIRED', 'Upload session expired');
  if (
    upload.uploadMode !== 'SINGLE' ||
    (upload.status !== 'INITIATED' && upload.status !== 'UPLOADING') ||
    upload.video.status !== 'UPLOADING' ||
    upload.expectedSizeBytes < 1n ||
    upload.expectedSizeBytes > BigInt(UPLOAD_LIMITS.singlePutLimitBytes)
  ) {
    throw new AppError(409, 'UPLOAD_NOT_SIGNABLE', 'Upload cannot be signed');
  }

  // Conditional update prevents signing sessions that were completed/expired in the interim.
  // A second request may re-sign an active upload until its expiry; PUT itself is reusable.
  const claimed = await prisma.videoUpload.updateMany({
    where: {
      id: uploadId,
      status: { in: ['INITIATED', 'UPLOADING'] },
      uploadMode: 'SINGLE',
      expiresAt: { gt: now },
      video: { ownerId, deletedAt: null, status: 'UPLOADING' },
    },
    data: { status: 'UPLOADING' },
  });
  if (claimed.count !== 1) throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Upload state changed');
  return {
    uploadId: upload.id,
    videoId: upload.videoId,
    expiresAt: upload.expiresAt,
    checksumSha256: upload.checksum,
  };
}
