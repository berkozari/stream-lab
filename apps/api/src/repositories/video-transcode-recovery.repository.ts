import { prisma } from '../config/database.js';

/** Only old, dispatched jobs are eligible for reconciliation. Redis is checked separately. */
export type TranscodingRecoveryCandidate = {
  id: string;
  videoId: string;
  jobId: string;
  processingVersion: number;
  status: 'QUEUED' | 'PROCESSING';
  leaseToken: string | null;
  leaseExpiresAt: Date | null;
};

const DISPATCH_GRACE_MS = 2 * 60_000;
const LEASE_GRACE_MS = 30_000;

export async function findTranscodingRecoveryCandidates(
  limit: number,
  now = new Date(),
): Promise<TranscodingRecoveryCandidate[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new RangeError('Recovery batch limit must be between 1 and 100');
  }
  const rows = await prisma.videoTranscodeOutbox.findMany({
    where: {
      status: 'DISPATCHED',
      dispatchedAt: { lte: new Date(now.getTime() - DISPATCH_GRACE_MS) },
      video: {
        is: {
          deletedAt: null,
          OR: [
            { status: 'QUEUED' },
            {
              status: 'PROCESSING',
              processingLeaseExpiresAt: {
                lte: new Date(now.getTime() - LEASE_GRACE_MS),
              },
            },
          ],
        },
      },
    },
    orderBy: { dispatchedAt: 'asc' },
    take: Math.min(limit * 3, 300),
    select: {
      id: true,
      videoId: true,
      processingVersion: true,
      jobId: true,
      video: {
        select: {
          status: true,
          processingVersion: true,
          processingLeaseToken: true,
          processingLeaseExpiresAt: true,
        },
      },
    },
  });
  return rows
    .filter(
      (row) =>
        row.processingVersion === row.video.processingVersion &&
        (row.video.status === 'QUEUED' || row.video.status === 'PROCESSING') &&
        (row.video.status === 'QUEUED' ||
          (row.video.processingLeaseExpiresAt !== null &&
            row.video.processingLeaseExpiresAt.getTime() <= now.getTime() - LEASE_GRACE_MS)),
    )
    .slice(0, limit)
    .map((row) => ({
      id: row.id,
      videoId: row.videoId,
      jobId: row.jobId,
      processingVersion: row.processingVersion,
      status: row.video.status as 'QUEUED' | 'PROCESSING',
      leaseToken: row.video.processingLeaseToken,
      leaseExpiresAt: row.video.processingLeaseExpiresAt,
    }));
}

export type TranscodingRecoveryAction =
  'redispatch' | 'terminal-failed' | 'completed-without-ready';

/**
 * Recovery and its outbox change must commit together. Strict CAS fences a worker
 * which renewed its lease or finished after the Redis state was read.
 * No Redis call is allowed inside this database transaction.
 */
export async function applyTranscodingRecovery(
  candidate: TranscodingRecoveryCandidate,
  action: TranscodingRecoveryAction,
  now = new Date(),
): Promise<boolean> {
  return prisma
    .$transaction(async (tx) => {
      const outbox = await tx.videoTranscodeOutbox.updateMany({
        where: { id: candidate.id, status: 'DISPATCHED', jobId: candidate.jobId },
        data:
          action === 'redispatch'
            ? {
                status: 'PENDING',
                nextAttemptAt: now,
                dispatchedAt: null,
                lastErrorCode: 'JOB_MISSING_RECOVERY',
              }
            : {
                lastErrorCode:
                  action === 'terminal-failed'
                    ? 'JOB_TERMINAL_FAILED'
                    : 'JOB_COMPLETED_WITHOUT_READY',
              },
      });
      if (outbox.count !== 1) return false;
      const video = await tx.video.updateMany({
        where: {
          id: candidate.videoId,
          deletedAt: null,
          status: candidate.status,
          processingVersion: candidate.processingVersion,
          processingLeaseToken: candidate.leaseToken,
          processingLeaseExpiresAt:
            candidate.status === 'PROCESSING'
              ? { equals: candidate.leaseExpiresAt, lte: new Date(now.getTime() - LEASE_GRACE_MS) }
              : candidate.leaseExpiresAt,
        },
        data: {
          status: action === 'redispatch' ? 'QUEUED' : 'FAILED',
          processingLeaseToken: null,
          processingLeaseExpiresAt: null,
        },
      });
      if (video.count !== 1) {
        // Rolling back a stale outbox update is mandatory, including its error code.
        throw new StaleTranscodingRecovery();
      }
      return true;
    })
    .catch((error: unknown) => {
      if (error instanceof StaleTranscodingRecovery) return false;
      throw error;
    });
}

class StaleTranscodingRecovery extends Error {}
