import { logger } from '../lib/logger.js';
import {
  dispatchTranscodingOutboxBatch,
  type TranscodingDispatchSummary,
} from './video-transcode-dispatch.service.js';

export type OutboxDispatcherOptions = {
  intervalMs?: number;
  dispatch?: () => Promise<TranscodingDispatchSummary>;
  onError?: (error: unknown) => void;
  onProgress?: (summary: TranscodingDispatchSummary) => void;
};

/**
 * One active batch per API process; never schedule overlapping intervals.
 * Durable PENDING rows and expired DISPATCHING claims are picked up after a crash.
 * Only the real BullMQ worker processes jobs; this loop ONLY dispatches them.
 */
export function startTranscodingOutboxDispatcher(
  options: OutboxDispatcherOptions = {},
): () => Promise<void> {
  const intervalMs = options.intervalMs ?? 2_000;
  if (!Number.isInteger(intervalMs) || intervalMs < 1 || intervalMs > 60_000) {
    throw new RangeError('Transcoding dispatcher interval must be between 1 and 60000 ms');
  }
  const dispatch = options.dispatch ?? (() => dispatchTranscodingOutboxBatch());
  const onError =
    options.onError ??
    ((err: unknown) => logger.warn({ err }, 'transcoding dispatch batch failed'));
  const onProgress =
    options.onProgress ??
    ((summary: TranscodingDispatchSummary) => {
      if (summary.claimed) logger.info({ summary }, 'transcoding outbox dispatched');
    });

  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> | undefined;
  const tick = () => {
    if (stopped) return;
    inFlight = (async () => {
      try {
        onProgress(await dispatch());
      } catch (error) {
        try {
          onError(error);
        } catch {
          /* logging must not stop recovery */
        }
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
