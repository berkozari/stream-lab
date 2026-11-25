import { logger } from '../lib/logger.js';
import {
  reconcileTranscodingJobs,
  type TranscodingRecoverySummary,
} from './video-transcode-recovery.service.js';

export type TranscodingRecoveryLoopOptions = {
  intervalMs?: number;
  reconcile?: () => Promise<TranscodingRecoverySummary>;
};

/** Bounded polling, single in-flight scan, graceful shutdown, no background promises leaked. */
export function startTranscodingRecoveryLoop(
  options: TranscodingRecoveryLoopOptions = {},
): () => Promise<void> {
  const intervalMs = options.intervalMs ?? 60_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs > 600_000) {
    throw new RangeError('Transcoding recovery interval must be between 1 and 600000 ms');
  }
  const reconcile = options.reconcile ?? (() => reconcileTranscodingJobs());
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  const tick = () => {
    if (stopped) return;
    inFlight = (async () => {
      try {
        const summary = await reconcile();
        if (summary.redispatched || summary.terminalFailed || summary.errors || summary.raced) {
          logger.warn({ summary }, 'transcoding recovery scan');
        }
      } catch (error) {
        logger.error({ err: error }, 'transcoding recovery scan failed');
      } finally {
        inFlight = undefined;
        if (!stopped) timer = setTimeout(tick, intervalMs);
      }
    })();
  };
  tick();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (inFlight) await inFlight;
  };
}
