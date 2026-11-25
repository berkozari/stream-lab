/** Browser media lifecycle, independent from the HLS playback engine. */
export type PlaybackPhase = 'loading' | 'ready' | 'buffering' | 'ended' | 'error';

export const PLAYBACK_LIFECYCLE_EVENTS = [
  'loadstart',
  'loadedmetadata',
  'canplay',
  'playing',
  'waiting',
  'stalled',
  'seeking',
  'seeked',
  'ended',
] as const;

export type PlaybackLifecycleEvent = (typeof PLAYBACK_LIFECYCLE_EVENTS)[number];
export type PlaybackFailure = 'network' | 'media' | 'unsupported' | 'unknown';

export function nextPlaybackPhase(
  current: PlaybackPhase,
  event: PlaybackLifecycleEvent,
  paused: boolean,
): PlaybackPhase {
  // Once an attempt fails, subsequent browser events must not hide the error.
  if (current === 'error' && event !== 'loadstart') return 'error';
  switch (event) {
    case 'loadstart':
      return 'loading';
    case 'loadedmetadata':
      // Metadata alone does not guarantee a decodable, buffered frame.
      return current;
    case 'canplay':
    case 'playing':
    case 'seeked':
      return 'ready';
    case 'waiting':
    case 'stalled':
      if (paused) return current;
      return current === 'loading' ? 'loading' : 'buffering';
    case 'seeking':
      return paused ? current : 'buffering';
    case 'ended':
      return 'ended';
  }
}

export function classifyMediaError(code: number | undefined): PlaybackFailure {
  switch (code) {
    case 2:
      return 'network';
    case 3:
      return 'media';
    case 4:
      return 'unsupported';
    default:
      return 'unknown';
  }
}

/** hls.js ErrorTypes values; avoid linking this pure helper to the HLS runtime. */
export function classifyHlsFailure(type: string): PlaybackFailure {
  if (type === 'networkError') return 'network';
  if (type === 'mediaError') return 'media';
  return 'unknown';
}

export function playbackFailureText(kind: PlaybackFailure): string {
  switch (kind) {
    case 'network':
      return 'Video verileri yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.';
    case 'media':
      return 'Video çözümlenirken bir sorun oluştu. Tekrar deneyebilirsiniz.';
    case 'unsupported':
      return 'Tarayıcı video biçimini oynatamıyor.';
    default:
      return 'Video oynatılırken bir sorun oluştu. Tekrar deneyin.';
  }
}

export function playbackPhaseText(phase: PlaybackPhase): string | null {
  if (phase === 'loading') return 'Video hazırlanıyor…';
  if (phase === 'buffering') return 'Video yükleniyor…';
  return null;
}
