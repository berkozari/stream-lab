export type WatchProgressSample = { positionSeconds: number; completed: boolean };
export type ProgressWriter = (sample: WatchProgressSample) => Promise<unknown>;

export const PROGRESS_REPORT_INTERVAL_MS = 15_000;

/** Normalization is shared by periodic, seek, pause and ended updates. */
export function normalizeProgress(
  positionSeconds: number,
  completed = false,
): WatchProgressSample | null {
  if (!Number.isFinite(positionSeconds) || positionSeconds < 0) return null;
  return {
    positionSeconds: Math.min(864_000, Math.floor(positionSeconds)),
    completed,
  };
}

/**
 * Serialize writes. A delayed periodic PUT must not overwrite a newer seek/end PUT.
 * Failed writes are non-fatal to video playback and the next event can retry.
 */
export function createProgressReporter(
  write: ProgressWriter,
  onError: (failed: boolean) => void = () => undefined,
  clock: () => number = () => Date.now(),
) {
  let lastQueuedAt = Number.NEGATIVE_INFINITY;
  let pending: WatchProgressSample | null = null;
  let running = false;
  let closed = false;
  let idleResolvers: Array<() => void> = [];

  function wakeIdle() {
    if (!running && !pending) {
      const resolves = idleResolvers;
      idleResolvers = [];
      resolves.forEach((resolve) => resolve());
    }
  }
  async function drain() {
    if (running || closed) return;
    running = true;
    while (pending !== null && !closed) {
      const value = pending;
      pending = null;
      try {
        await write(value);
        if (!closed) onError(false);
      } catch {
        if (!closed) onError(true);
      }
    }
    running = false;
    wakeIdle();
  }

  return {
    report(sample: WatchProgressSample, force = false) {
      if (closed) return;
      const value = normalizeProgress(sample.positionSeconds, sample.completed);
      if (!value) return;
      const at = clock();
      if (!force && at - lastQueuedAt < PROGRESS_REPORT_INTERVAL_MS) return;
      if (!force && !value.completed && value.positionSeconds === 0) return;
      lastQueuedAt = at;
      pending = value; // retain only latest unsent update
      void drain();
    },
    /** Prevent writes from a prior user/video after the active viewer changes. */
    close() {
      closed = true;
      pending = null;
      wakeIdle();
    },
    /** Test-only idle hook, does not keep playback open. */
    whenIdle(): Promise<void> {
      if (!running && !pending) return Promise.resolve();
      return new Promise((resolve) => idleResolvers.push(resolve));
    },
  };
}

/**
 * Source teardown may reset currentTime to 0 with no loaded metadata.
 * Reject that transition; real seeks to 0 with loaded metadata remain valid.
 */
export function mediaProgressSample(
  media: { currentTime: number; readyState: number; currentSrc: string; ended: boolean },
  completed = false,
): WatchProgressSample | null {
  if (media.readyState < 1 || !media.currentSrc) return null;
  return normalizeProgress(media.currentTime, completed || media.ended);
}
