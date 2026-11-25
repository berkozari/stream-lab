import type { Job } from 'bullmq';
import {
  VIDEO_PROCESSING_SMOKE_JOB_NAME,
  VIDEO_TRANSCODE_JOB_NAME,
  VideoTranscodeJobDataSchema,
  type QueueSmokeJobData,
  type QueueSmokeJobResult,
  type VideoTranscodeJobData,
} from '@streamlab/contracts';
import { processSmokeJob } from './smoke.processor.js';

export type TranscodingJobResult = {
  outcome: 'ready' | 'stale';
  videoId: string;
  processingVersion: number;
};
export type ProcessingJobResult = QueueSmokeJobResult | TranscodingJobResult;
export type TranscodingHandler = (
  job: Job<VideoTranscodeJobData>,
  token?: string,
) => Promise<TranscodingJobResult>;

/**
 * The router is ready for the STREAM-005.4 HLS processor. The live BullMQ worker
 * continues using smoke.processor until the HLS handler can publish complete outputs.
 * Never mark a transcoding job completed after only probing its input.
 */
export function createVideoProcessingRouter(
  processTranscode: TranscodingHandler,
  processSmoke: (job: Job<QueueSmokeJobData>) => Promise<QueueSmokeJobResult> = processSmokeJob,
): (job: Job, token?: string) => Promise<ProcessingJobResult> {
  return async (job, token) => {
    switch (job.name) {
      case VIDEO_PROCESSING_SMOKE_JOB_NAME:
        return processSmoke(job as Job<QueueSmokeJobData>);
      case VIDEO_TRANSCODE_JOB_NAME:
        VideoTranscodeJobDataSchema.parse(job.data);
        return processTranscode(job as Job<VideoTranscodeJobData>, token);
      default:
        throw new Error(`Unsupported video processing job: ${job.name}`);
    }
  };
}
