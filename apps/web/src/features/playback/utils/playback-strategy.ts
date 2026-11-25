/** Prefer MSE/hls.js when available; fall back to native HLS (e.g. iOS Safari). */
export type PlaybackStrategy = 'native' | 'hlsjs' | 'unsupported';

export function choosePlaybackStrategy(
  nativeHlsSupported: boolean,
  mediaSourceSupported: boolean,
): PlaybackStrategy {
  if (mediaSourceSupported) return 'hlsjs';
  return nativeHlsSupported ? 'native' : 'unsupported';
}
