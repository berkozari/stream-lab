import { useCallback, useEffect, useRef } from 'react';
import { playbackAnalyticsService } from '../services/playback-analytics.service';
import {
  createPlaybackAnalyticsQueue,
  playbackTokenFromManifest,
  type AnalyticsSequence,
} from '../utils/playback-analytics-queue';
import type { PlaybackAnalyticsSample } from '../utils/playback-analytics-tracker';

/** Analytics is intentionally independent of authenticated WatchProgress. */
export function usePlaybackAnalytics(videoId: string | undefined, manifestUrl: string | undefined) {
  // React StrictMode replays effects: retain the same session and monotonic sequence.
  const identityRef = useRef<{ videoId: string; state: AnalyticsSequence } | null>(null);
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = playbackTokenFromManifest(manifestUrl);
  }, [manifestUrl]);
  const queueRef = useRef<ReturnType<typeof createPlaybackAnalyticsQueue> | null>(null);

  useEffect(() => {
    if (!videoId) return;
    if (identityRef.current?.videoId !== videoId) {
      identityRef.current = { videoId, state: { sessionId: crypto.randomUUID(), next: 0 } };
    }
    const identity = identityRef.current;
    const queue = createPlaybackAnalyticsQueue(identity.state, async (sample) => {
      const token = tokenRef.current;
      if (!token) return;
      await playbackAnalyticsService.report(videoId, { ...sample, playbackToken: token });
    });
    queueRef.current = queue;
    return () => {
      queue.close();
      if (queueRef.current === queue) queueRef.current = null;
    };
  }, [videoId]);

  const report = useCallback((sample: PlaybackAnalyticsSample) => {
    queueRef.current?.report(sample);
  }, []);
  return { report };
}
