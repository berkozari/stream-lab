import { useEffect, useId, useRef, useState } from 'react';
import type Hls from 'hls.js';
import { choosePlaybackStrategy, type PlaybackStrategy } from '../utils/playback-strategy';
import {
  capturePlaybackSnapshot,
  safePlaybackResumeTime,
  selectInitialResumeSnapshot,
  type PlaybackResumeSnapshot,
} from '../utils/playback-resume';
import {
  applyQualitySelection,
  buildQualityOptions,
  type QualityOption,
} from '../utils/quality-options';
import {
  PLAYBACK_LIFECYCLE_EVENTS,
  classifyHlsFailure,
  classifyMediaError,
  nextPlaybackPhase,
  playbackFailureText,
  playbackPhaseText,
  type PlaybackFailure,
  type PlaybackPhase,
} from '../utils/playback-status';

import {
  mediaProgressSample,
  type WatchProgressSample,
} from '@/features/watch-history/utils/progress-reporting';

type HlsPlayerProps = {
  initialPositionSeconds?: number;
  onWatchProgress?: (sample: WatchProgressSample, force: boolean) => void;
  manifestUrl: string;
  title: string;
  onRefreshPlayback?: () => Promise<boolean>;
};

/** Native media controls cover play/pause, seek, volume and fullscreen.
 * hls.js adds ABR, while this component handles playback lifecycle and errors.
 */
export function HlsPlayer({
  manifestUrl,
  title,
  onRefreshPlayback,
  initialPositionSeconds = 0,
  onWatchProgress,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  // Keep the playhead and manual quality when a short-lived manifest URL is renewed.
  const savedPlaybackRef = useRef<PlaybackResumeSnapshot | null>(null);
  // StrictMode can replay the effect before metadata arrives.
  const initialResumePendingRef = useRef(true);
  const qualityOptionsRef = useRef<QualityOption[]>([]);
  const selectedQualityRef = useRef(-1);
  const qualitySelectId = useId();
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [phase, setPhase] = useState<PlaybackPhase>('loading');
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [strategy, setStrategy] = useState<PlaybackStrategy | null>(null);
  const [qualityOptions, setQualityOptions] = useState<QualityOption[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = ABR/Auto
  const [activeQuality, setActiveQuality] = useState<number | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let cancelled = false;
    let reportedFailure = false;
    let destroyHls: (() => void) | undefined;
    const resume = selectInitialResumeSnapshot(
      savedPlaybackRef.current,
      initialPositionSeconds,
      initialResumePendingRef.current,
    );
    savedPlaybackRef.current = null;
    qualityOptionsRef.current = [];
    selectedQualityRef.current = -1;
    setPlayerError(null);
    setPhase('loading');
    setQualityOptions([]);
    setSelectedQuality(-1);
    setActiveQuality(null);
    setStrategy(null);

    const reportFailure = (kind: PlaybackFailure) => {
      if (cancelled || reportedFailure) return;
      reportedFailure = true;
      setPhase('error');
      setPlayerError(playbackFailureText(kind));
    };

    const onVideoError = () => {
      if (cancelled || !video.error || !video.currentSrc) return;
      if (import.meta.env.DEV) {
        // Never log signed manifest or segment URLs.
        console.error('[playback] video error', {
          code: video.error.code,
          networkState: video.networkState,
          readyState: video.readyState,
          sourceType: video.currentSrc.startsWith('blob:') ? 'media-source' : 'url',
        });
      }
      reportFailure(classifyMediaError(video.error.code));
    };
    video.addEventListener('error', onVideoError);

    // A new signed manifest requires a new HLS source; restore the previous position.
    let restored = false;
    const restorePlayback = () => {
      if (cancelled || restored || !resume || video.readyState < 1) return;
      try {
        video.muted = resume.muted;
        video.volume = resume.volume;
        video.playbackRate = resume.playbackRate;
        const targetTime = safePlaybackResumeTime(resume.positionSeconds, video.duration);
        // If duration is temporarily zero, retry on canplay instead of clearing resume.
        if (resume.positionSeconds > 0 && targetTime <= 0) return;
        video.currentTime = targetTime;
        restored = true;
        initialResumePendingRef.current = false;
        if (resume.wasPlaying) {
          // Browser autoplay policy may reject this; native controls remain available.
          void video.play().catch(() => undefined);
        }
      } catch {
        // Some media engines cannot seek until canplay; retry on that event.
      }
    };
    video.addEventListener('loadedmetadata', restorePlayback);
    video.addEventListener('canplay', restorePlayback);

    const mediaListeners = PLAYBACK_LIFECYCLE_EVENTS.map((eventName) => {
      const listener = () => {
        if (cancelled) return;
        setPhase((current) => nextPlaybackPhase(current, eventName, video.paused));
      };
      video.addEventListener(eventName, listener);
      return { eventName, listener };
    });

    const nativeHlsSupported = video.canPlayType('application/vnd.apple.mpegurl') !== '';
    void import('hls.js')
      .then(({ default: HlsEngine }) => {
        if (cancelled) return;
        const mode = choosePlaybackStrategy(nativeHlsSupported, HlsEngine.isSupported());
        setStrategy(mode);

        if (mode === 'native') {
          video.src = manifestUrl;
          video.load();
          return;
        }
        if (mode === 'unsupported') {
          reportFailure('unsupported');
          return;
        }

        const hls = new HlsEngine({ enableWorker: true });
        hlsRef.current = hls;
        destroyHls = () => hls.destroy();

        hls.on(HlsEngine.Events.MEDIA_ATTACHED, () => {
          if (!cancelled) hls.loadSource(manifestUrl);
        });
        hls.on(HlsEngine.Events.MANIFEST_PARSED, () => {
          if (cancelled) return;
          const options = buildQualityOptions(hls.levels);
          qualityOptionsRef.current = options;
          setQualityOptions(options);
          const savedQuality = resume?.manualQualityLabel
            ? options.find((option) => option.label === resume.manualQualityLabel)
            : undefined;
          const index = savedQuality?.index ?? -1;
          if (index !== -1) hls.nextLevel = index;
          selectedQualityRef.current = index;
          setSelectedQuality(index);
          if (import.meta.env.DEV) {
            console.info('[playback] manifest parsed', { levels: hls.levels.length });
          }
        });
        hls.on(HlsEngine.Events.LEVEL_SWITCHED, (_event, data) => {
          if (!cancelled) setActiveQuality(data.level);
        });
        hls.on(HlsEngine.Events.ERROR, (_event, data) => {
          if (cancelled || !data.fatal) return;
          if (import.meta.env.DEV) {
            // Log only error categories; URLs may contain playback credentials.
            console.error('[playback] hls.js fatal error', {
              type: data.type,
              details: data.details,
            });
          }
          // Fatal network errors indicate that hls.js has exhausted its internal retries.
          // Do not enter an unbounded automatic retry loop.
          reportFailure(classifyHlsFailure(data.type));
        });
        hls.attachMedia(video);
      })
      .catch(() => {
        reportFailure('unknown');
      });

    return () => {
      cancelled = true;
      const manualQualityLabel =
        qualityOptionsRef.current.find((option) => option.index === selectedQualityRef.current)
          ?.label ?? null;
      savedPlaybackRef.current = capturePlaybackSnapshot(video, manualQualityLabel);
      video.removeEventListener('error', onVideoError);
      video.removeEventListener('loadedmetadata', restorePlayback);
      video.removeEventListener('canplay', restorePlayback);
      for (const { eventName, listener } of mediaListeners) {
        video.removeEventListener(eventName, listener);
      }
      hlsRef.current = null;
      destroyHls?.();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [manifestUrl, attempt, initialPositionSeconds]);

  // Progress tracking is independent from manifest renewal.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !onWatchProgress) return;
    let active = false;
    let lastValidSample: WatchProgressSample | null = null;
    const report = (force: boolean, completed = false) => {
      if (!active) return;
      // Do not send an artificial 0s after hls.js detaches its media source.
      const sample = mediaProgressSample(video, completed);
      if (!sample) return;
      lastValidSample = sample;
      onWatchProgress(sample, force);
    };
    const markActive = () => {
      active = true;
    };
    const onSeeked = () => {
      active = true;
      report(true);
    };
    const onEnd = () => {
      active = true;
      report(true, true);
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') report(true);
    };
    video.addEventListener('playing', markActive);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('pause', onPause);
    video.addEventListener('ended', onEnd);
    document.addEventListener('visibilitychange', onHidden);
    function onTimeUpdate() {
      report(false);
    }
    function onPause() {
      report(true);
    }
    return () => {
      // This cleanup may run after the player effect resets video.currentTime.
      if (lastValidSample) onWatchProgress(lastValidSample, true);
      video.removeEventListener('playing', markActive);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('ended', onEnd);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [onWatchProgress]);

  const setQuality = (value: number) => {
    // Switch at the next fragment without recreating the player or losing playhead position.
    if (applyQualitySelection(hlsRef.current, qualityOptions, value)) {
      selectedQualityRef.current = value;
      setSelectedQuality(value);
    }
  };

  async function retryPlayback() {
    if (retrying) return;
    setRetrying(true);
    try {
      // The old capability may have expired; always request a new one first.
      const changed = await onRefreshPlayback?.();
      // A new URL already reinitializes the effect; don't reset it twice.
      if (!changed) setAttempt((value) => value + 1);
    } catch {
      setPlayerError('Oynatma bağlantısı yenilenemedi. Tekrar deneyin.');
    } finally {
      setRetrying(false);
    }
  }

  const currentLabel = qualityOptions.find((quality) => quality.index === activeQuality)?.label;
  const statusText = playerError ? null : playbackPhaseText(phase);

  return (
    <div className="space-y-3">
      <div className="relative">
        <video
          ref={videoRef}
          aria-label={title}
          controls
          playsInline
          preload="metadata"
          className="aspect-video w-full rounded-xl bg-black"
        >
          Tarayıcınız HTML5 video oynatmayı desteklemiyor.
        </video>
        {statusText && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg bg-black/75 px-3 py-2 text-sm text-white"
            >
              <span
                aria-hidden="true"
                className="size-4 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin"
              />
              {statusText}
            </div>
          </div>
        )}
      </div>
      {strategy === 'hlsjs' && qualityOptions.length > 1 && !playerError && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label htmlFor={qualitySelectId} className="font-medium">
            Görüntü kalitesi
          </label>
          <select
            id={qualitySelectId}
            value={selectedQuality}
            onChange={(event) => setQuality(Number(event.target.value))}
            className="rounded-lg border border-border bg-card px-3 py-2 text-foreground"
          >
            <option value={-1}>Otomatik</option>
            {qualityOptions.map((quality) => (
              <option key={quality.index} value={quality.index}>
                {quality.label}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground" role="status">
            {selectedQuality === -1
              ? `Aktif: ${currentLabel ?? 'belirleniyor'}`
              : `Seçilen: ${qualityOptions.find((q) => q.index === selectedQuality)?.label ?? '—'}`}
          </span>
        </div>
      )}
      {strategy === 'hlsjs' && qualityOptions.length === 1 && !playerError && (
        <p className="text-sm text-muted-foreground">Kalite: {qualityOptions[0]?.label}</p>
      )}
      {strategy === 'native' && !playerError && (
        <p className="text-sm text-muted-foreground">
          Kalite, tarayıcınız tarafından otomatik yönetiliyor.
        </p>
      )}
      {playerError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>{playerError}</p>
          {strategy !== 'unsupported' && (
            <button
              type="button"
              className="rounded-lg border border-border px-3 py-2 text-foreground hover:bg-muted"
              disabled={retrying}
              onClick={() => void retryPlayback()}
            >
              {retrying ? 'Yenileniyor…' : 'Tekrar dene'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
