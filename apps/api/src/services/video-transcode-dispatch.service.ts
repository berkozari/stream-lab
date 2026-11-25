import type { VideoTranscodeJobData } from '@streamlab/contracts';
import {
  cancelStaleTranscodingDispatch,
  claimDueTranscodingJobs,
  deferTranscodingDispatch,
  isQueuedTranscodingAttempt,
  markTranscodingDispatched,
  type TranscodingDispatchClaim,
} from '../repositories/video-transcode-outbox.repository.js';
import { enqueueVideoTranscode } from './video-transcode-queue.service.js';

export type TranscodingDispatchDependencies = {
  claim: (limit: number) => Promise<TranscodingDispatchClaim[]>;
  eligible: (job: TranscodingDispatchClaim) => Promise<boolean>;
  enqueue: (data: VideoTranscodeJobData) => Promise<string>;
  dispatched: (job: TranscodingDispatchClaim) => Promise<void>;
  defer: (job: TranscodingDispatchClaim) => Promise<void>;
  cancel: (job: TranscodingDispatchClaim) => Promise<void>;
};

export type TranscodingDispatchSummary = {
  claimed: number;
  dispatched: number;
  deferred: number;
  cancelled: number;
};

/**
 * One-shot dispatch batch. Do NOT schedule this until video.transcode worker support exists.
 * DB failure after Redis success is recovered by the expiring claim and stable BullMQ job ID.
 */
export function createDispatchTranscodingOutbox(
  dependencies: TranscodingDispatchDependencies = {
    claim: claimDueTranscodingJobs,
    eligible: isQueuedTranscodingAttempt,
    enqueue: enqueueVideoTranscode,
    dispatched: markTranscodingDispatched,
    defer: deferTranscodingDispatch,
    cancel: cancelStaleTranscodingDispatch,
  },
): (limit?: number) => Promise<TranscodingDispatchSummary> {
  return async (limit = 20) => {
    const jobs = await dependencies.claim(limit);
    const summary: TranscodingDispatchSummary = {
      claimed: jobs.length,
      dispatched: 0,
      deferred: 0,
      cancelled: 0,
    };
    for (const job of jobs) {
      try {
        if (!(await dependencies.eligible(job))) {
          await dependencies.cancel(job);
          summary.cancelled++;
          continue;
        }
        await dependencies.enqueue({
          contractVersion: 1,
          videoId: job.videoId,
          processingVersion: job.processingVersion,
        });
        await dependencies.dispatched(job);
        summary.dispatched++;
      } catch {
        // A failure before or after enqueue cannot be resolved by rolling back Redis.
        // Defer it; same-version retries use exactly the same stable BullMQ job ID.
        await dependencies.defer(job);
        summary.deferred++;
      }
    }
    return summary;
  };
}

export const dispatchTranscodingOutboxBatch = createDispatchTranscodingOutbox();
