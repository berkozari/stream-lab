import { VideoTranscodeJobDataSchema, type VideoTranscodeJobData } from '@streamlab/contracts';
import { workerPrisma } from '../config/database.js';
import type { HlsProfile } from '../services/transcoding/hls-profiles.js';

export type PublishReadyInput = {
  job: VideoTranscodeJobData;
  claimToken: string;
  durationSeconds: number;
  masterKey: string;
  masterSizeBytes: bigint;
  profiles: HlsProfile[];
  keyFor: (relativePath: string) => string;
};

/**
 * DB metadata is all-or-nothing. The write is fenced by the lease token AND expiry.
 * Storage objects are immutable and attempt-scoped, so losing claim cannot replace a
 * different worker's manifests. Orphans are cleaned by the caller on failed commit.
 */
export async function commitTranscodingReady(
  input: PublishReadyInput,
  db: Pick<typeof workerPrisma, '$transaction'> = workerPrisma,
  now = new Date(),
): Promise<void> {
  const job = VideoTranscodeJobDataSchema.parse(input.job);
  const durationSeconds = Math.ceil(input.durationSeconds);
  if (
    !Number.isSafeInteger(durationSeconds) ||
    durationSeconds < 1 ||
    durationSeconds > 86_400 ||
    input.masterSizeBytes < 1n ||
    !input.profiles.length
  ) {
    throw new Error('HLS_READY_METADATA_INVALID');
  }
  await db.$transaction(async (tx) => {
    const claimed = await tx.video.updateMany({
      where: {
        id: job.videoId,
        processingVersion: job.processingVersion,
        status: 'PROCESSING',
        deletedAt: null,
        processingLeaseToken: input.claimToken,
        processingLeaseExpiresAt: { gt: now },
      },
      data: {
        status: 'READY',
        durationSeconds,
        processingLeaseToken: null,
        processingLeaseExpiresAt: null,
      },
    });
    if (claimed.count !== 1) throw new Error('TRANSCODING_LEASE_LOST');
    await tx.mediaAsset.create({
      data: {
        videoId: job.videoId,
        processingVersion: job.processingVersion,
        kind: 'HLS_MASTER',
        storageKey: input.masterKey,
        contentType: 'application/vnd.apple.mpegurl',
        sizeBytes: input.masterSizeBytes,
      },
    });
    await tx.videoRendition.createMany({
      data: input.profiles.map((profile) => ({
        videoId: job.videoId,
        processingVersion: job.processingVersion,
        label: profile.label,
        width: profile.width,
        height: profile.height,
        bitrate: profile.videoBitrate + profile.audioBitrate,
        codec: 'h264',
        playlistKey: input.keyFor(`${profile.label}/index.m3u8`),
      })),
    });
  });
}
