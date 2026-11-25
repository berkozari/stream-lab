import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getVideoTranscodeJobId, type VideoTranscodeJobData } from '@streamlab/contracts';
import type { Prisma } from '../generated/prisma/client.js';
import { prisma } from '../config/database.js';
import { AppError } from '../utils/app-error.js';

/** Prisma owns the transaction boundary; Redis is NEVER called inside this transaction. */
export async function stageTranscodingInTransaction(
  tx: Prisma.TransactionClient,
  videoId: string,
): Promise<VideoTranscodeJobData> {
  const original = await tx.mediaAsset.findFirst({
    where: { videoId, kind: 'ORIGINAL' },
    select: { id: true },
  });
  if (!original) {
    throw new AppError(409, 'ORIGINAL_NOT_FOUND', 'Verified original is required');
  }

  // Conditional UPDATE provides a row-level CAS: concurrent calls cannot start two attempts.
  const updated = await tx.video.updateMany({
    where: {
      id: videoId,
      status: 'UPLOADED',
      deletedAt: null,
      processingVersion: { lt: 2_147_483_647 },
    },
    data: { status: 'QUEUED', processingVersion: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new AppError(409, 'VIDEO_NOT_QUEUEABLE', 'Video cannot be queued for processing');
  }

  const video = await tx.video.findUniqueOrThrow({
    where: { id: videoId },
    select: { processingVersion: true },
  });
  const data: VideoTranscodeJobData = {
    contractVersion: 1,
    videoId,
    processingVersion: video.processingVersion,
  };
  await tx.videoTranscodeOutbox.create({
    data: {
      videoId,
      processingVersion: data.processingVersion,
      jobId: getVideoTranscodeJobId(data),
      // New outbox rows default to PENDING.
    },
  });
  return data;
}

export async function stageTranscodingAttempt(videoId: string): Promise<VideoTranscodeJobData> {
  z.uuid().parse(videoId);
  return prisma.$transaction((tx) => stageTranscodingInTransaction(tx, videoId));
}

export type TranscodingDispatchClaim = {
  id: string;
  videoId: string;
  processingVersion: number;
  jobId: string;
  claimToken: string;
  attempts: number;
};

const LEASE_MS = 5 * 60_000;

/** Claims are CAS-protected, not held as SQL transactions during external Redis IO. */
export async function claimDueTranscodingJobs(limit: number): Promise<TranscodingDispatchClaim[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Outbox batch limit must be between 1 and 100');
  }
  const now = new Date();
  const due = {
    OR: [
      { status: 'PENDING' as const, nextAttemptAt: { lte: now } },
      { status: 'DISPATCHING' as const, leaseExpiresAt: { lte: now } },
    ],
  };
  const candidates = await prisma.videoTranscodeOutbox.findMany({
    where: due,
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit * 3, 300),
    select: { id: true, videoId: true, processingVersion: true, jobId: true },
  });

  const claims: TranscodingDispatchClaim[] = [];
  for (const row of candidates) {
    if (claims.length >= limit) break;
    const claimToken = randomUUID();
    const updated = await prisma.videoTranscodeOutbox.updateMany({
      where: { id: row.id, ...due },
      data: {
        status: 'DISPATCHING',
        claimToken,
        leaseExpiresAt: new Date(now.getTime() + LEASE_MS),
        attempts: { increment: 1 },
        lastErrorCode: null,
      },
    });
    if (updated.count !== 1) continue;
    // Count belongs to the successful claim; other dispatchers will not claim this lease.
    const claimed = await prisma.videoTranscodeOutbox.findUniqueOrThrow({
      where: { id: row.id },
      select: { attempts: true },
    });
    claims.push({ ...row, claimToken, attempts: claimed.attempts });
  }
  return claims;
}

/** Soft-deleted, stale-version and already-running videos must not be redispatched. */
export async function isQueuedTranscodingAttempt(
  claim: TranscodingDispatchClaim,
): Promise<boolean> {
  return (
    (await prisma.video.count({
      where: {
        id: claim.videoId,
        status: 'QUEUED',
        processingVersion: claim.processingVersion,
        deletedAt: null,
      },
    })) === 1
  );
}

async function updateClaim(
  claim: TranscodingDispatchClaim,
  data: Prisma.VideoTranscodeOutboxUpdateManyMutationInput,
): Promise<void> {
  const updated = await prisma.videoTranscodeOutbox.updateMany({
    where: { id: claim.id, status: 'DISPATCHING', claimToken: claim.claimToken },
    data: { ...data, claimToken: null, leaseExpiresAt: null },
  });
  if (updated.count !== 1) {
    throw new Error('Transcoding outbox lease is no longer owned by this dispatcher');
  }
}

export async function markTranscodingDispatched(claim: TranscodingDispatchClaim): Promise<void> {
  await updateClaim(claim, { status: 'DISPATCHED', dispatchedAt: new Date() });
}

export async function cancelStaleTranscodingDispatch(
  claim: TranscodingDispatchClaim,
): Promise<void> {
  await updateClaim(claim, { status: 'CANCELLED', lastErrorCode: 'VIDEO_NOT_QUEUEABLE' });
}

export async function deferTranscodingDispatch(claim: TranscodingDispatchClaim): Promise<void> {
  const delayMs = Math.min(60 * 60_000, 5_000 * 2 ** Math.min(claim.attempts - 1, 10));
  await updateClaim(claim, {
    status: 'PENDING',
    nextAttemptAt: new Date(Date.now() + delayMs),
    // Error messages can contain credentials/URLs; store an opaque, safe code only.
    lastErrorCode: 'QUEUE_DISPATCH_FAILED',
  });
}
