import { VideoTranscodeJobDataSchema, type VideoTranscodeJobData } from '@streamlab/contracts';
import { workerPrisma } from '../config/database.js';
import type { OriginalSource } from '../services/storage/original-source.js';

/** Read-only source lookup. Does NOT claim the job or change video state. */
export async function getQueuedTranscodingSource(
  data: VideoTranscodeJobData,
): Promise<OriginalSource> {
  const job = VideoTranscodeJobDataSchema.parse(data);
  const video = await workerPrisma.video.findFirst({
    where: {
      id: job.videoId,
      processingVersion: job.processingVersion,
      status: 'QUEUED',
      deletedAt: null,
    },
    select: {
      mediaAssets: {
        where: { kind: 'ORIGINAL' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { storageKey: true, sizeBytes: true },
      },
    },
  });
  if (!video) throw new Error('TRANSCODE_ATTEMPT_NOT_QUEUEABLE');
  const original = video.mediaAssets[0];
  if (!original || original.sizeBytes === null) throw new Error('TRANSCODE_ORIGINAL_MISSING');
  return { storageKey: original.storageKey, sizeBytes: original.sizeBytes };
}

/** Only a worker holding the current PROCESSING lease may publish the original. */
export async function getClaimedTranscodingSource(
  data: VideoTranscodeJobData,
  claimToken: string,
): Promise<OriginalSource> {
  const job = VideoTranscodeJobDataSchema.parse(data);
  const video = await workerPrisma.video.findFirst({
    where: {
      id: job.videoId,
      processingVersion: job.processingVersion,
      status: 'PROCESSING',
      deletedAt: null,
      processingLeaseToken: claimToken,
      processingLeaseExpiresAt: { gt: new Date() },
    },
    select: {
      mediaAssets: {
        where: { kind: 'ORIGINAL' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { storageKey: true, sizeBytes: true },
      },
    },
  });
  if (!video) throw new Error('TRANSCODING_LEASE_LOST');
  const original = video.mediaAssets[0];
  if (!original || original.sizeBytes === null) throw new Error('TRANSCODE_ORIGINAL_MISSING');
  return { storageKey: original.storageKey, sizeBytes: original.sizeBytes };
}
