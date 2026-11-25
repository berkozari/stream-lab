import { randomUUID } from 'node:crypto';
import { VideoTranscodeJobDataSchema, type VideoTranscodeJobData } from '@streamlab/contracts';
import { workerPrisma } from '../config/database.js';

/** The job is still QUEUED while the API/outbox transfers it to Redis. */
export type TranscodingClaim =
  | { kind: 'claimed'; token: string; expiresAt: Date }
  | { kind: 'busy'; retryAt: Date }
  | { kind: 'stale' };

export type TranscodingLeaseStore = Pick<typeof workerPrisma, 'video'>;

/**
 * A short lease bounds the lifetime of a claimed processing attempt.
 * FFmpeg must renew this lease periodically and stop before publishing when renewal fails.
 */
export const TRANSCODING_LEASE_MS = 5 * 60_000;

/**
 * Optimistic claim / recovery: either QUEUED, or PROCESSING with an expired lease.
 * A new token fences writes from an older worker that lost ownership.
 */
export async function claimTranscodingLease(
  input: VideoTranscodeJobData,
  db: TranscodingLeaseStore = workerPrisma,
  now = new Date(),
): Promise<TranscodingClaim> {
  const job = VideoTranscodeJobDataSchema.parse(input);
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + TRANSCODING_LEASE_MS);
  const updated = await db.video.updateMany({
    where: {
      id: job.videoId,
      processingVersion: job.processingVersion,
      deletedAt: null,
      OR: [
        { status: 'QUEUED' },
        {
          status: 'PROCESSING',
          OR: [{ processingLeaseExpiresAt: { lte: now } }, { processingLeaseExpiresAt: null }],
        },
      ],
    },
    data: {
      status: 'PROCESSING',
      processingLeaseToken: token,
      processingLeaseExpiresAt: expiresAt,
    },
  });
  if (updated.count === 1) return { kind: 'claimed', token, expiresAt };

  const current = await db.video.findUnique({
    where: { id: job.videoId },
    select: {
      status: true,
      processingVersion: true,
      deletedAt: true,
      processingLeaseExpiresAt: true,
    },
  });
  if (
    !current ||
    current.deletedAt !== null ||
    current.processingVersion !== job.processingVersion
  ) {
    return { kind: 'stale' };
  }
  if (current.status === 'PROCESSING') {
    // Another worker may be healthy, or a concurrent CAS beat us to an expired claim.
    return { kind: 'busy', retryAt: current.processingLeaseExpiresAt ?? expiresAt };
  }
  // A job for READY/FAILED/DELETING must never change the video's state.
  return { kind: 'stale' };
}

/** One failed/expired worker cannot extend another worker's lease. */
export async function renewTranscodingLease(
  input: VideoTranscodeJobData,
  token: string,
  db: TranscodingLeaseStore = workerPrisma,
  now = new Date(),
): Promise<boolean> {
  const job = VideoTranscodeJobDataSchema.parse(input);
  return (
    (
      await db.video.updateMany({
        where: {
          id: job.videoId,
          processingVersion: job.processingVersion,
          status: 'PROCESSING',
          deletedAt: null,
          processingLeaseToken: token,
          processingLeaseExpiresAt: { gt: now },
        },
        data: { processingLeaseExpiresAt: new Date(now.getTime() + TRANSCODING_LEASE_MS) },
      })
    ).count === 1
  );
}

/**
 * Called only by the worker holding an unexpired claim.
 * On a retry release to QUEUED; after the last attempt mark FAILED.
 * A later HLS publishing transaction will independently perform token-fenced READY.
 */
export async function releaseTranscodingLease(
  input: VideoTranscodeJobData,
  token: string,
  disposition: 'retry' | 'failed',
  db: TranscodingLeaseStore = workerPrisma,
  now = new Date(),
): Promise<boolean> {
  const job = VideoTranscodeJobDataSchema.parse(input);
  return (
    (
      await db.video.updateMany({
        where: {
          id: job.videoId,
          processingVersion: job.processingVersion,
          status: 'PROCESSING',
          deletedAt: null,
          processingLeaseToken: token,
          processingLeaseExpiresAt: { gt: now },
        },
        data: {
          status: disposition === 'retry' ? 'QUEUED' : 'FAILED',
          processingLeaseToken: null,
          processingLeaseExpiresAt: null,
        },
      })
    ).count === 1
  );
}
