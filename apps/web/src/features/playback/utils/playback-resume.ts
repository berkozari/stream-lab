/** Browser-independent state snapshot for renewing a HLS capability URL. */
export type PlaybackResumeSnapshot = {
  positionSeconds: number;
  wasPlaying: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
  manualQualityLabel: string | null;
};

type MediaState = {
  currentTime: number;
  paused: boolean;
  ended: boolean;
  muted: boolean;
  volume: number;
  playbackRate: number;
};

export function capturePlaybackSnapshot(
  video: MediaState,
  manualQualityLabel: string | null,
): PlaybackResumeSnapshot {
  return {
    positionSeconds: Number.isFinite(video.currentTime) ? Math.max(0, video.currentTime) : 0,
    wasPlaying: !video.paused && !video.ended,
    muted: video.muted,
    volume: video.volume,
    playbackRate: video.playbackRate,
    manualQualityLabel,
  };
}

export function safePlaybackResumeTime(positionSeconds: number, duration: number): number {
  if (!Number.isFinite(positionSeconds) || positionSeconds <= 0) return 0;
  if (!Number.isFinite(duration)) return positionSeconds;
  return Math.min(positionSeconds, Math.max(0, duration - 0.25));
}
