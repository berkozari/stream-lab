import { randomUUID } from 'node:crypto';
import { UPLOAD_LIMITS, type CreateMultipartUploadRequest } from '@streamlab/contracts';
import { prisma } from '../config/database.js';
import { createStagingObjectKey } from '../lib/storage-keys.js';
import { AppError } from '../utils/app-error.js';

export type MultipartRecord = {
  id: string;
  videoId: string;
  storageUploadId: string;
  expectedSizeBytes: bigint;
  expiresAt: Date;
  status: 'INITIATED' | 'UPLOADING';
};

/** Serialize with the SINGLE session creator on Video row to prevent two active uploads. */
export async function reserveMultipartSession(
  videoId: string,
  ownerId: string,
  input: CreateMultipartUploadRequest,
) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status" FROM "Video"
      WHERE "id" = ${videoId}::uuid AND "ownerId" = ${ownerId}::uuid AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const video = rows[0];
    if (!video) throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (!['DRAFT', 'UPLOADING'].includes(video.status)) {
      throw new AppError(409, 'VIDEO_UPLOAD_STATE', 'Video cannot accept an upload');
    }
    const now = new Date();
    await tx.videoUpload.updateMany({
      where: { videoId, status: { in: ['INITIATED', 'UPLOADING'] }, expiresAt: { lte: now } },
      data: { status: 'EXPIRED' },
    });
    const active = await tx.videoUpload.findFirst({
      where: { videoId, status: { in: ['INITIATED', 'UPLOADING'] }, expiresAt: { gt: now } },
      select: { id: true },
    });
    if (active) throw new AppError(409, 'UPLOAD_ALREADY_ACTIVE', 'An upload is already active');
    const updated = await tx.video.updateMany({
      where: { id: videoId, ownerId, deletedAt: null, status: { in: ['DRAFT', 'UPLOADING'] } },
      data: { status: 'UPLOADING' },
    });
    if (updated.count !== 1) throw new AppError(409, 'VIDEO_STATE_CHANGED', 'Video state changed');
    const uploadId = randomUUID();
    return tx.videoUpload.create({
      data: {
        id: uploadId,
        videoId,
        storageKey: createStagingObjectKey(videoId, uploadId),
        status: 'INITIATED',
        uploadMode: 'MULTIPART',
        expectedSizeBytes: BigInt(input.sizeBytes),
        checksum: input.checksumSha256 ?? null,
        expiresAt: new Date(now.getTime() + UPLOAD_LIMITS.uploadSessionTtlSeconds * 1000),
      },
      select: { id: true, videoId: true, expiresAt: true },
    });
  });
}

export async function bindStorageMultipartId(uploadId: string, s3UploadId: string) {
  const result = await prisma.videoUpload.updateMany({
    where: {
      id: uploadId,
      uploadMode: 'MULTIPART',
      status: 'INITIATED',
      storageUploadId: null,
      expiresAt: { gt: new Date() },
    },
    data: { storageUploadId: s3UploadId },
  });
  if (result.count !== 1)
    throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Multipart session changed');
}

/** Best effort cleanup of a failed S3 initiation. Does not suppress the original error. */
export async function failMultipartReservation(uploadId: string, videoId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.videoUpload.updateMany({
      where: { id: uploadId, status: 'INITIATED', uploadMode: 'MULTIPART' },
      data: { status: 'FAILED' },
    });
    const stillActive = await tx.videoUpload.count({
      where: { videoId, status: { in: ['INITIATED', 'UPLOADING'] }, expiresAt: { gt: new Date() } },
    });
    if (stillActive === 0) {
      await tx.video.updateMany({
        where: { id: videoId, status: 'UPLOADING' },
        data: { status: 'DRAFT' },
      });
    }
  });
}

/** Never distinguish another owner's upload from a nonexistent upload. */
export async function getOwnedMultipart(
  uploadId: string,
  ownerId: string,
): Promise<MultipartRecord> {
  const record = await prisma.videoUpload.findFirst({
    where: { id: uploadId, video: { ownerId, deletedAt: null } },
    select: {
      id: true,
      videoId: true,
      storageUploadId: true,
      uploadMode: true,
      status: true,
      expiresAt: true,
      expectedSizeBytes: true,
      video: { select: { status: true } },
    },
  });
  if (!record) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
  if (record.uploadMode !== 'MULTIPART') {
    throw new AppError(409, 'NOT_MULTIPART', 'Upload does not use multipart mode');
  }
  if (record.expiresAt <= new Date())
    throw new AppError(410, 'UPLOAD_EXPIRED', 'Upload session expired');
  if (!['INITIATED', 'UPLOADING'].includes(record.status) || record.video.status !== 'UPLOADING') {
    throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Multipart upload is not active');
  }
  if (!record.storageUploadId)
    throw new AppError(409, 'UPLOAD_NOT_INITIALIZED', 'Multipart upload is not available');
  return {
    id: record.id,
    videoId: record.videoId,
    storageUploadId: record.storageUploadId,
    expectedSizeBytes: record.expectedSizeBytes,
    expiresAt: record.expiresAt,
    status: record.status === 'UPLOADING' ? 'UPLOADING' : 'INITIATED',
  };
}

export async function claimMultipartPart(upload: MultipartRecord, ownerId: string) {
  const result = await prisma.videoUpload.updateMany({
    where: {
      id: upload.id,
      storageUploadId: upload.storageUploadId,
      uploadMode: 'MULTIPART',
      status: { in: ['INITIATED', 'UPLOADING'] },
      expiresAt: { gt: new Date() },
      video: { ownerId, deletedAt: null, status: 'UPLOADING' },
    },
    data: { status: 'UPLOADING' },
  });
  if (result.count !== 1)
    throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Multipart upload state changed');
}

/** An assembled MULTIPART session has no active S3 UploadId; 004.6 may now verify the object. */
export async function markMultipartAssembled(upload: MultipartRecord, ownerId: string) {
  const result = await prisma.videoUpload.updateMany({
    where: {
      id: upload.id,
      storageUploadId: upload.storageUploadId,
      uploadMode: 'MULTIPART',
      status: 'UPLOADING',
      expiresAt: { gt: new Date() },
      video: { ownerId, deletedAt: null, status: 'UPLOADING' },
    },
    data: { storageUploadId: null },
  });
  if (result.count !== 1)
    throw new AppError(409, 'UPLOAD_STATE_CHANGED', 'Multipart upload changed after assembly');
}

/** Mark cancellation first to prevent additional signing. Return S3 ID for best effort abort. */
export async function cancelOwnedMultipart(uploadId: string, ownerId: string) {
  return prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<
      Array<{ id: string; videoId: string; storageUploadId: string | null; status: string }>
    >`
      SELECT u."id", u."videoId", u."storageUploadId", u."status"
      FROM "VideoUpload" u JOIN "Video" v ON v."id" = u."videoId"
      WHERE u."id" = ${uploadId}::uuid AND u."uploadMode" = 'MULTIPART'
        AND v."ownerId" = ${ownerId}::uuid AND v."deletedAt" IS NULL
      FOR UPDATE OF u
    `;
    const current = locked[0];
    if (!current) throw new AppError(404, 'UPLOAD_NOT_FOUND', 'Upload not found');
    if (current.status === 'VERIFIED')
      throw new AppError(409, 'UPLOAD_ALREADY_COMPLETED', 'Verified upload cannot be aborted');
    if (!['INITIATED', 'UPLOADING', 'FAILED', 'EXPIRED'].includes(current.status)) {
      throw new AppError(409, 'UPLOAD_NOT_ABORTABLE', 'Upload cannot be aborted');
    }
    if (current.status === 'INITIATED' || current.status === 'UPLOADING') {
      await tx.videoUpload.update({ where: { id: uploadId }, data: { status: 'FAILED' } });
      const active = await tx.videoUpload.count({
        where: {
          videoId: current.videoId,
          status: { in: ['INITIATED', 'UPLOADING'] },
          expiresAt: { gt: new Date() },
        },
      });
      if (!active)
        await tx.video.updateMany({
          where: { id: current.videoId, ownerId, status: 'UPLOADING' },
          data: { status: 'DRAFT' },
        });
    }
    return { uploadId, videoId: current.videoId, storageUploadId: current.storageUploadId };
  });
}
