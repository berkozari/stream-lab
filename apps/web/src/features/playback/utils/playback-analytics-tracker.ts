/** Browser-side media-time accounting; backend always applies its own wall-clock cap. */
export type PlaybackAnalyticsKind = 'START' | 'HEARTBEAT' | 'PAUSE' | 'SEEK' | 'ENDED';
export type PlaybackAnalyticsSample = {
  kind: PlaybackAnalyticsKind;
  positionSeconds: number;
  playedSeconds: number;
};
export type AnalyticsMedia = {
  currentTime: number;
  playbackRate: number;
  readyState: number;
  paused: boolean;
  seeking: boolean;
  ended: boolean;
};

const MAX_POSITION = 864_000;
const MAX_PLAYED = 30;
const REGULAR_HEARTBEAT_MS = 15_000;

function position(media: AnalyticsMedia): number {
  return Number.isFinite(media.currentTime)
    ? Math.min(MAX_POSITION, Math.max(0, Math.floor(media.currentTime)))
    : 0;
}

/**
 * A seek/buffer/pause is not watched time. Count only forward media movement while
 * actively playing, bounded by monotonic elapsed time. Do not use currentTime alone:
 * seeking from 10s to 5min must never add 290s of viewing.
 */
export function createPlaybackAnalyticsTracker(
  report: (event: PlaybackAnalyticsSample) => void,
  now: () => number = () => performance.now(),
) {
  let active = false;
  let closed = false;
  let lastAt: number | null = null;
  let lastPosition = 0;
  let unreported = 0;
  let lastHeartbeatAt: number | null = null;

  function resetAnchor(media: AnalyticsMedia) {
    lastAt = now();
    lastPosition = media.currentTime;
  }

  function collect(media: AnalyticsMedia) {
    const at = now();
    if (lastAt !== null && active && media.readyState >= 2 && !media.seeking) {
      const elapsed = Math.max(0, (at - lastAt) / 1000);
      const progressed = Math.max(0, media.currentTime - lastPosition);
      const rate = Number.isFinite(media.playbackRate) ? media.playbackRate : 1;
      // Allow small measurement jitter; cap speedups and sudden discontinuities.
      const safeSpeed = Math.max(0.25, Math.min(4, rate));
      const legitimate = Math.min(progressed, elapsed * safeSpeed + 0.3, MAX_PLAYED);
      if (Number.isFinite(legitimate)) unreported += legitimate;
    }
    lastAt = at;
    lastPosition = media.currentTime;
  }

  function emit(kind: PlaybackAnalyticsKind, media: AnalyticsMedia) {
    if (closed) return;
    const playedSeconds =
      kind === 'START' || kind === 'SEEK' ? 0 : Math.min(MAX_PLAYED, Math.floor(unreported));
    if (playedSeconds > 0) unreported -= playedSeconds;
    report({ kind, positionSeconds: position(media), playedSeconds });
    if (kind === 'HEARTBEAT') lastHeartbeatAt = now();
  }

  return {
    playing(media: AnalyticsMedia) {
      if (closed || active || media.ended) return;
      active = true;
      resetAnchor(media);
      emit('START', media);
    },
    timeupdate(media: AnalyticsMedia) {
      if (!closed && active) collect(media);
    },
    heartbeat(media: AnalyticsMedia) {
      if (closed || !active || media.paused || media.seeking || media.ended) return;
      collect(media);
      const canReport =
        Math.floor(unreported) >= 3 &&
        (lastHeartbeatAt === null || now() - lastHeartbeatAt >= REGULAR_HEARTBEAT_MS);
      if (canReport) emit('HEARTBEAT', media);
    },
    seeking(media: AnalyticsMedia) {
      if (closed) return;
      // The browser sets seeking=true before this event; only accrued pre-seek time is sent.
      if (Math.floor(unreported) >= 1) emit('HEARTBEAT', media);
      active = false;
      resetAnchor(media);
    },
    seeked(media: AnalyticsMedia) {
      if (closed) return;
      resetAnchor(media);
      emit('SEEK', media);
      if (!media.paused && !media.ended) {
        active = true;
        resetAnchor(media);
      }
    },
    waiting(media: AnalyticsMedia) {
      if (closed || !active) return;
      collect(media);
      active = false;
      if (Math.floor(unreported) >= 1) emit('HEARTBEAT', media);
    },
    pause(media: AnalyticsMedia) {
      if (closed || !active) return;
      collect(media);
      active = false;
      emit('PAUSE', media);
    },
    ended(media: AnalyticsMedia) {
      if (closed) return;
      if (active) collect(media);
      active = false;
      emit('ENDED', media);
    },
    hidden(media: AnalyticsMedia) {
      if (closed || !active) return;
      collect(media);
      active = false;
      emit('PAUSE', media);
    },
    close() {
      closed = true;
    },
  };
}
