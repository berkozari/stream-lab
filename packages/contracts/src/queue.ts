import { z } from 'zod';

/** Wire contract shared between the API producer and the standalone worker. */
export const VIDEO_PROCESSING_QUEUE_NAME = 'streamlab-video-processing' as const;
export const VIDEO_PROCESSING_SMOKE_JOB_NAME = 'smoke.verify' as const;

export type QueueSmokeJobData = {
  requestId: string;
  queuedAt: string;
  /** Used only by the STREAM-001.8 smoke test to exercise BullMQ retries. */
  failFirstAttempt?: boolean;
};

export type QueueSmokeJobResult = {
  requestId: string;
  processedAt: string;
  workerPid: number;
};

/** STREAM-005: versioned, minimal payload for a real transcoding job. */
export const VIDEO_TRANSCODE_JOB_NAME = 'video.transcode' as const;

export const VideoTranscodeJobDataSchema = z.strictObject({
  contractVersion: z.literal(1),
  videoId: z.uuid(),
  processingVersion: z.number().int().positive(),
});

export type VideoTranscodeJobData = z.infer<typeof VideoTranscodeJobDataSchema>;

/** Deterministic ID: duplicate dispatches for the same attempt share one BullMQ job. */
export function getVideoTranscodeJobId(data: VideoTranscodeJobData): string {
  const validated = VideoTranscodeJobDataSchema.parse(data);
  return `transcode-${validated.videoId}-${validated.processingVersion}`;
}
