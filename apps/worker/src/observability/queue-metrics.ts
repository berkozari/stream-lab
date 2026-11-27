import type { Queue } from 'bullmq';

export const VIDEO_QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

export type VideoQueueMetrics = Record<(typeof VIDEO_QUEUE_STATES)[number], number> & {
  paused: boolean;
};
export type QueueMetricsReader = Pick<Queue, 'getJobCounts' | 'isPaused'>;

/** Read four BullMQ v6 job counters and the queue's separate pause flag. No job payloads. */
export async function collectVideoQueueMetrics(
  queue: QueueMetricsReader,
): Promise<VideoQueueMetrics> {
  const [counts, paused] = await Promise.all([
    queue.getJobCounts(...VIDEO_QUEUE_STATES),
    queue.isPaused(),
  ]);
  if (typeof paused !== 'boolean') {
    throw new Error('Invalid BullMQ pause status');
  }
  const snapshot = {} as VideoQueueMetrics;
  for (const state of VIDEO_QUEUE_STATES) {
    const count = counts[state];
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) {
      throw new Error('Invalid BullMQ queue count');
    }
    snapshot[state] = count;
  }
  return { ...snapshot, paused };
}

export type PollOptions = {
  intervalMs: number;
  collect: () => Promise<VideoQueueMetrics>;
  onSnapshot: (metrics: VideoQueueMetrics) => void;
  onError: (error: unknown) => void;
};

/** One metrics read at a time. A late result must not log after stop. */
export function startQueueMetricsPolling(options: PollOptions): () => Promise<void> {
  if (
    !Number.isInteger(options.intervalMs) ||
    options.intervalMs < 1 ||
    options.intervalMs > 600_000
  ) {
    throw new RangeError('Queue metrics interval must be 1..600000ms');
  }
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | undefined;
  const tick = () => {
    if (stopped) return;
    inFlight = (async () => {
      try {
        const metrics = await options.collect();
        if (!stopped) options.onSnapshot(metrics);
      } catch (error) {
        if (!stopped) options.onError(error);
      } finally {
        inFlight = undefined;
        if (!stopped) {
          timer = setTimeout(tick, options.intervalMs);
          timer.unref();
        }
      }
    })();
  };
  // First observation after a bounded interval avoids extra Redis traffic at startup.
  timer = setTimeout(tick, options.intervalMs);
  timer.unref();
  return async () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    if (inFlight) await inFlight;
  };
}
