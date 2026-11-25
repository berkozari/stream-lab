import { getVideoProcessingQueue } from '../lib/video-processing-queue.js';
import {
  findTranscodingRecoveryCandidates,
  applyTranscodingRecovery,
  type TranscodingRecoveryCandidate,
  type TranscodingRecoveryAction,
} from '../repositories/video-transcode-recovery.repository.js';

export type RecoveryQueueState = string;
export type TranscodingRecoveryDependencies = {
  find: (limit: number) => Promise<TranscodingRecoveryCandidate[]>;
  state: (jobId: string) => Promise<RecoveryQueueState>;
  apply: (
    candidate: TranscodingRecoveryCandidate,
    action: TranscodingRecoveryAction,
  ) => Promise<boolean>;
};
export type TranscodingRecoverySummary = {
  checked: number;
  redispatched: number;
  terminalFailed: number;
  preserved: number;
  raced: number;
  errors: number;
};

/**
 * BullMQ handles ordinary retries/stalls. This is a last-resort repair for
 * disappeared Redis jobs and exhausted/terminal jobs, NOT a replacement for BullMQ.
 * If Redis cannot be queried, no database state is changed.
 */
export function createReconcileTranscodingJobs(
  deps: TranscodingRecoveryDependencies = {
    find: findTranscodingRecoveryCandidates,
    state: (jobId) => getVideoProcessingQueue().getJobState(jobId),
    apply: applyTranscodingRecovery,
  },
): (limit?: number) => Promise<TranscodingRecoverySummary> {
  return async (limit = 20) => {
    const candidates = await deps.find(limit);
    const result: TranscodingRecoverySummary = {
      checked: candidates.length,
      redispatched: 0,
      terminalFailed: 0,
      preserved: 0,
      raced: 0,
      errors: 0,
    };
    for (const candidate of candidates) {
      try {
        const state = await deps.state(candidate.jobId);
        let action: TranscodingRecoveryAction;
        switch (state) {
          case 'unknown':
            action = 'redispatch';
            break;
          case 'failed':
            action = 'terminal-failed';
            break;
          case 'completed':
            action = 'completed-without-ready';
            break;
          default:
            // Active, waiting, delayed, paused, waiting-children, etc. are owned
            // by BullMQ. Never bypass its locks or scheduled retry strategy.
            result.preserved++;
            continue;
        }
        if (!(await deps.apply(candidate, action))) {
          result.raced++;
        } else if (action === 'redispatch') {
          result.redispatched++;
        } else {
          result.terminalFailed++;
        }
      } catch {
        // Redis outage or DB write failure must not trigger unsafe requeue.
        result.errors++;
      }
    }
    return result;
  };
}

export const reconcileTranscodingJobs = createReconcileTranscodingJobs();
