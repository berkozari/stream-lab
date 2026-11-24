import { randomUUID } from 'node:crypto';
import type { CreateUploadRequest } from '@streamlab/contracts';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import { prisma } from '../config/database.js';
import { createStagingObjectKey } from '../lib/storage-keys.js';
import { AppError } from '../utils/app-error.js';

export type UploadSessionRecord = {
  id: string;
  videoId: string;
  status: 'INITIATED';
  uploadMode: 'SINGLE';
  expiresAt: Date;
};

/**
 * The video row is locked before examining uploads, serializing concurrent
 * requests for the same video without requiring a new partial-unique index.
 * Do not call S3/network services from inside this transaction.
 */
export async function insertOwnedUploadSession(
  videoId: string,
  ownerId: string,
  input: CreateUploadRequest,
): Promise<UploadSessionRecord> {
  return prisma.$transaction(async (tx) => {
    // Tagged raw SQL parameterizes identifiers; no client-supplied SQL or object keys.
    const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
      SELECT "id", "status" FROM "Video"
      WHERE "id" = ${videoId}::uuid
        AND "ownerId" = ${ownerId}::uuid
        AND "deletedAt" IS NULL
      FOR UPDATE
    `;
    const video = locked[0];
    if (!video) throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    if (video.status !== 'DRAFT' && video.status !== 'UPLOADING') {
      throw new AppError(409, 'VIDEO_UPLOAD_STATE', 'Video cannot accept an upload');
    }

    const now = new Date();
    await tx.videoUpload.updateMany({
      where: {
        videoId,
        status: { in: ['INITIATED', 'UPLOADING'] },
        expiresAt: { lte: now },
      },
      data: { status: 'EXPIRED' },
    });

    const active = await tx.videoUpload.findFirst({
      where: {
        videoId,
        status: { in: ['INITIATED', 'UPLOADING'] },
        expiresAt: { gt: now },
      },
      select: { id: true },
    });
    if (active) throw new AppError(409, 'UPLOAD_ALREADY_ACTIVE', 'An upload is already active');

    const updated = await tx.video.updateMany({
      where: {
        id: videoId,
        ownerId,
        deletedAt: null,
        status: { in: ['DRAFT', 'UPLOADING'] },
      },
      data: { status: 'UPLOADING' },
    });
    if (updated.count !== 1) {
      throw new AppError(409, 'VIDEO_STATE_CHANGED', 'Video state changed; please retry');
    }

    const uploadId = randomUUID();
    const created = await tx.videoUpload.create({
      data: {
        id: uploadId,
        videoId,
        status: 'INITIATED',
        uploadMode: 'SINGLE',
        storageKey: createStagingObjectKey(videoId, uploadId),
        expectedSizeBytes: BigInt(input.sizeBytes),
        checksum: input.checksumSha256 ?? null,
        expiresAt: new Date(now.getTime() + UPLOAD_LIMITS.uploadSessionTtlSeconds * 1000),
      },
      select: {
        id: true,
        videoId: true,
        status: true,
        uploadMode: true,
        expiresAt: true,
      },
    });
    // Prisma enums on a create() result have the broad enum type; the state set
    // in the INSERT is authoritative for this freshly-created session.
    return {
      id: created.id,
      videoId: created.videoId,
      status: 'INITIATED' as const,
      uploadMode: 'SINGLE' as const,
      expiresAt: created.expiresAt,
    };
  });
}
