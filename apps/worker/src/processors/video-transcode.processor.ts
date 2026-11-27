import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import { workerLogger } from '../lib/logger.js';
import {
  VIDEO_TRANSCODE_JOB_NAME,
  VideoTranscodeJobDataSchema,
  type VideoTranscodeJobData,
} from '@streamlab/contracts';
import {
  claimTranscodingLease,
  renewTranscodingLease,
  releaseTranscodingLease,
  TRANSCODING_LEASE_MS,
  type TranscodingClaim,
} from '../repositories/transcoding-lease.repository.js';
import type { TranscodingHandler, TranscodingJobResult } from './video-processing.router.js';

/** An HLS publisher must upload all assets and token-fence the final READY DB commit. */
export type PublishHls = (input: {
  job: VideoTranscodeJobData;
  claimToken: string;
  signal: AbortSignal;
  beforeReadyCommit: () => Promise<void>;
}) => Promise<void>;

export type TranscodingProcessorDependencies = {
  claim: (job: VideoTranscodeJobData) => Promise<TranscodingClaim>;
  renew: (job: VideoTranscodeJobData, token: string) => Promise<boolean>;
  release: (
    job: VideoTranscodeJobData,
    token: string,
    action: 'retry' | 'failed',
  ) => Promise<boolean>;
  publishHls: PublishHls;
  heartbeatMs?: number;
  /** Abort active media work on SIGTERM/SIGINT without spending a BullMQ retry attempt. */
  shutdownSignal?: AbortSignal;
};

/**
 * Transcoding worker lifecycle: token-fenced claim, heartbeat, safe retries.
 *
 * On duplicate activation, delay until the active DB lease expires without consuming
 * a normal attempts retry. After a crash, an expired lease can be reclaimed.
 */
export function createVideoTranscodeProcessor(
  deps: TranscodingProcessorDependencies,
): TranscodingHandler {
  const intervalMs = deps.heartbeatMs ?? Math.floor(TRANSCODING_LEASE_MS / 3);
  if (!Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs >= TRANSCODING_LEASE_MS) {
    throw new RangeError(
      'Transcoding lease heartbeat interval must be positive and shorter than the lease',
    );
  }

  // BullMQ's DelayedError keeps a cooperatively interrupted job retryable,
  // even when the normal attempts budget has been exhausted.
  const delayForShutdown = async (job: Job<VideoTranscodeJobData>, workerToken?: string) => {
    if (!workerToken) throw new Error('TRANSCODING_SHUTDOWN_MISSING_WORKER_TOKEN');
    await job.moveToDelayed(Date.now() + 3_000, workerToken);
    throw new DelayedError();
  };

  return async (
    job: Job<VideoTranscodeJobData>,
    workerToken?: string,
  ): Promise<TranscodingJobResult> => {
    if (job.name !== VIDEO_TRANSCODE_JOB_NAME) throw new Error('Unsupported transcoding job');
    const data = VideoTranscodeJobDataSchema.parse(job.data);
    if (deps.shutdownSignal?.aborted) return delayForShutdown(job, workerToken);
    const claim = await deps.claim(data);
    if (claim.kind === 'stale') {
      return { outcome: 'stale', videoId: data.videoId, processingVersion: data.processingVersion };
    }
    if (claim.kind === 'busy') {
      if (!workerToken) throw new Error('TRANSCODING_BUSY_MISSING_WORKER_TOKEN');
      const delayUntil = Math.max(Date.now() + 1000, claim.retryAt.getTime() + 1000);
      await job.moveToDelayed(delayUntil, workerToken);
      throw new DelayedError();
    }

    const abort = new AbortController();
    const onShutdown = () => abort.abort(new Error('TRANSCODING_WORKER_SHUTDOWN'));
    deps.shutdownSignal?.addEventListener('abort', onShutdown, { once: true });
    // Handle the race where the shutdown signal fired while claiming the lease.
    if (deps.shutdownSignal?.aborted) onShutdown();
    let leaseLost = false;
    let renewalInFlight: Promise<void> | undefined;
    const heartbeat = setInterval(() => {
      if (renewalInFlight || leaseLost) return;
      renewalInFlight = (async () => {
        try {
          if (!(await deps.renew(data, claim.token))) {
            leaseLost = true;
            abort.abort(new Error('TRANSCODING_LEASE_LOST'));
          }
        } catch {
          leaseLost = true;
          abort.abort(new Error('TRANSCODING_LEASE_RENEW_FAILED'));
        }
      })().finally(() => {
        renewalInFlight = undefined;
      });
    }, intervalMs);
    heartbeat.unref();

    const beforeReadyCommit = async () => {
      clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
      if (leaseLost || abort.signal.aborted) throw new Error('TRANSCODING_LEASE_LOST');
    };
    try {
      if (abort.signal.aborted) throw new Error('TRANSCODING_CANCELLED');
      await deps.publishHls({
        job: data,
        claimToken: claim.token,
        signal: abort.signal,
        beforeReadyCommit,
      });
      clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
      // The publisher has committed READY here. A shutdown signal arriving just
      // after that commit must not turn a successful job into a spurious failure.
      if (leaseLost) throw new Error('TRANSCODING_LEASE_LOST');
      return { outcome: 'ready', videoId: data.videoId, processingVersion: data.processingVersion };
    } catch (error) {
      clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
      if (deps.shutdownSignal?.aborted && !leaseLost) {
        // The publisher has finished its local/remote cleanup. First park the
        // BullMQ job with its lock token; THEN return DB ownership to QUEUED.
        // A failed Redis operation leaves the DB lease intact for 005.6A recovery.
        if (!workerToken)
          throw new Error('TRANSCODING_SHUTDOWN_MISSING_WORKER_TOKEN', { cause: error });
        await job.moveToDelayed(Date.now() + 3_000, workerToken);
        // If CAS loses, the delayed job will be stale/busy on reactivation.
        // Never overwrite a newer owner or a deleted video.
        try {
          await deps.release(data, claim.token, 'retry');
        } catch {
          // The job is already delayed in Redis; DB lease expiry and the
          // recovery scanner handle a transient PostgreSQL failure.
          workerLogger.warn(
            { event: 'transcoding_lease_release_failed' },
            'shutdown lease release failed; recovery will reconcile',
          );
        }
        throw new DelayedError();
      }
      const maxAttempts = job.opts.attempts ?? 1;
      const unrecoverable =
        error instanceof UnrecoverableError ||
        (error instanceof Error && error.name === 'UnrecoverableError');
      const retry = !unrecoverable && job.attemptsMade + 1 < maxAttempts;
      const released = await deps.release(data, claim.token, retry ? 'retry' : 'failed');
      if (!released) {
        // Another worker owns the lease, or the video was deleted/version-changed.
        // Never overwrite its state. Bubble the error for BullMQ diagnostics.
        throw new Error('TRANSCODING_FAILURE_WITHOUT_LEASE_OWNERSHIP', { cause: error });
      }
      throw error;
    } finally {
      deps.shutdownSignal?.removeEventListener('abort', onShutdown);
      clearInterval(heartbeat);
      if (renewalInFlight) await renewalInFlight;
    }
  };
}

/** Lease operations used by the live BullMQ transcoding worker. */
export const transcodingLeaseOperations = {
  claim: claimTranscodingLease,
  renew: renewTranscodingLease,
  release: releaseTranscodingLease,
};
