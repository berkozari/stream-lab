import type { JobsOptions } from 'bullmq';
import {
  VIDEO_TRANSCODE_JOB_NAME,
  VideoTranscodeJobDataSchema,
  getVideoTranscodeJobId,
  type VideoTranscodeJobData,
} from '@streamlab/contracts';
import { getVideoProcessingQueue } from '../lib/video-processing-queue.js';

/** Narrow injectable boundary: tests never require a real Redis connection. */
export type TranscodingJobAdder = (
  name: typeof VIDEO_TRANSCODE_JOB_NAME,
  data: VideoTranscodeJobData,
  options: JobsOptions,
) => Promise<{ id?: string } | undefined>;

/**
 * Producer-only foundation for STREAM-005.2.
 * DO NOT call from upload completion until the worker supports video.transcode
 * and the database state transition/recovery workflow is implemented.
 */
export function createEnqueueVideoTranscode(
  add: TranscodingJobAdder = (name, data, options) =>
    getVideoProcessingQueue().add(name, data, options),
): (data: VideoTranscodeJobData) => Promise<string> {
  return async (input) => {
    const data = VideoTranscodeJobDataSchema.parse(input);
    const jobId = getVideoTranscodeJobId(data);
    const job = await add(VIDEO_TRANSCODE_JOB_NAME, data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1_000 },
      removeOnFail: { age: 30 * 24 * 60 * 60, count: 1_000 },
    });
    if (job?.id !== jobId) {
      throw new Error('Transcoding queue returned an unexpected job ID');
    }
    return jobId;
  };
}

export const enqueueVideoTranscode = createEnqueueVideoTranscode();
