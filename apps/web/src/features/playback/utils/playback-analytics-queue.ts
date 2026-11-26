import type { PlaybackAnalyticsSample } from './playback-analytics-tracker';

/** Reuse one session for the lifetime of a mounted player, including HLS token renewal. */
export type AnalyticsSequence = { sessionId: string; next: number };
export type QueuedAnalyticsEvent = PlaybackAnalyticsSample & {
  sessionId: string;
  sequence: number;
};
export type AnalyticsWriter = (event: QueuedAnalyticsEvent) => Promise<unknown>;

/** Sequential sends preserve sequence order; failed tracking must never block playback. */
export function createPlaybackAnalyticsQueue(identity: AnalyticsSequence, writer: AnalyticsWriter) {
  const pending: QueuedAnalyticsEvent[] = [];
  let running = false;
  let closed = false;
  const MAX_PENDING = 32;

  async function drain() {
    if (running || closed) return;
    running = true;
    try {
      while (!closed && pending.length > 0) {
        const event = pending.shift()!;
        try {
          await writer(event);
        } catch {
          // Best-effort telemetry. Never log a signed token or interrupt video playback.
          // A later event carries a newer sequence; backend applies its own bounds.
        }
      }
    } finally {
      running = false;
      if (!closed && pending.length > 0) void drain();
    }
  }

  return {
    report(sample: PlaybackAnalyticsSample) {
      if (closed || identity.next > 1_000_000) return;
      const normalized: PlaybackAnalyticsSample = {
        kind: sample.kind,
        positionSeconds: Math.min(864_000, Math.max(0, Math.floor(sample.positionSeconds))),
        playedSeconds: Math.min(30, Math.max(0, Math.floor(sample.playedSeconds))),
      };
      if (
        !Number.isFinite(normalized.positionSeconds) ||
        !Number.isFinite(normalized.playedSeconds)
      )
        return;
      // Never let a stalled analytics endpoint build an unbounded in-memory queue.
      if (pending.length >= MAX_PENDING) {
        const oldHeartbeatIndex = pending.findIndex((item) => item.kind === 'HEARTBEAT');
        if (oldHeartbeatIndex >= 0) pending.splice(oldHeartbeatIndex, 1);
        else if (sample.kind === 'HEARTBEAT') return;
        else pending.shift();
      }
      pending.push({ ...normalized, sessionId: identity.sessionId, sequence: identity.next++ });
      void drain();
    },
    close() {
      closed = true;
      pending.length = 0;
    },
  };
}

export function playbackTokenFromManifest(manifestUrl: string | undefined): string | null {
  if (!manifestUrl) return null;
  try {
    const url = new URL(manifestUrl);
    // The playback API returns an absolute, signed URL. Never store or log this token.
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.searchParams.get('token');
  } catch {
    return null;
  }
}
