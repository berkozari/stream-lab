/** Session aggregation rules (pure and independent of the database). */
export const QUALIFIED_VIEW_SECONDS = 3;
export const MAX_EVENT_PLAYED_SECONDS = 30;
export const MAX_SESSION_WATCH_SECONDS = 86_400;

export type SessionState = {
  lastSequence: number;
  watchedSeconds: number;
  lastEventAt: Date;
  startedAt: Date;
  qualifiedAt: Date | null;
  completedAt: Date | null;
};
export type PlaybackSample = {
  sequence: number;
  kind: 'START' | 'HEARTBEAT' | 'PAUSE' | 'SEEK' | 'ENDED';
  playedSeconds: number;
};

export function nextPlaybackSessionState(
  current: SessionState,
  sample: PlaybackSample,
  now: Date,
): {
  ignored: boolean;
  increment: number;
  watchedSeconds: number;
  qualifiedAt: Date | null;
  completedAt: Date | null;
} {
  if (sample.sequence <= current.lastSequence) {
    return {
      ignored: true,
      increment: 0,
      watchedSeconds: current.watchedSeconds,
      qualifiedAt: current.qualifiedAt,
      completedAt: current.completedAt,
    };
  }
  // Client time is advisory; upper-bound it with time elapsed on the server.
  const elapsed = Math.max(0, Math.floor((now.getTime() - current.lastEventAt.getTime()) / 1000));
  const elapsedSinceStart = Math.max(
    0,
    Math.floor((now.getTime() - current.startedAt.getTime()) / 1000),
  );
  const remainingWallBudget = Math.max(0, elapsedSinceStart - current.watchedSeconds);
  const requested = sample.kind === 'START' || sample.kind === 'SEEK' ? 0 : sample.playedSeconds;
  const increment = Math.max(
    0,
    Math.min(
      requested,
      MAX_EVENT_PLAYED_SECONDS,
      elapsed,
      remainingWallBudget,
      MAX_SESSION_WATCH_SECONDS - current.watchedSeconds,
    ),
  );
  const watchedSeconds = current.watchedSeconds + increment;
  const qualifiedAt =
    current.qualifiedAt ?? (watchedSeconds >= QUALIFIED_VIEW_SECONDS ? now : null);
  // An ENDED event is an indication from the player, not cryptographic completion proof.
  const completedAt = current.completedAt ?? (sample.kind === 'ENDED' && qualifiedAt ? now : null);
  return { ignored: false, increment, watchedSeconds, qualifiedAt, completedAt };
}
