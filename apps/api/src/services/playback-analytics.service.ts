import {
  PlaybackAnalyticsAckSchema,
  type PlaybackAnalyticsEvent,
  type PlaybackAnalyticsAck,
} from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import { nextPlaybackSessionState } from '../lib/playback-analytics-rules.js';
import type {
  PlaybackSession,
  SessionIdentity,
  SessionUpdate,
} from '../repositories/playback-analytics.repository.js';

export type AnalyticsStore = {
  ensure: (identity: SessionIdentity, now: Date) => Promise<void>;
  read: (id: string) => Promise<PlaybackSession | null>;
  advance: (id: string, previousSequence: number, update: SessionUpdate) => Promise<boolean>;
};
export type AnalyticsAuthorization = (
  videoId: string,
  playbackToken: string,
) => Promise<{ videoId: string; viewerId: string | null; processingVersion: number }>;
export type AnalyticsHandler = (
  videoId: string,
  payload: PlaybackAnalyticsEvent,
) => Promise<PlaybackAnalyticsAck>;

const defaultStore: AnalyticsStore = {
  ensure: async (...args) =>
    (await import('../repositories/playback-analytics.repository.js')).ensureAnalyticsSession(
      ...args,
    ),
  read: async (...args) =>
    (await import('../repositories/playback-analytics.repository.js')).readAnalyticsSession(
      ...args,
    ),
  advance: async (...args) =>
    (await import('../repositories/playback-analytics.repository.js')).advanceAnalyticsSession(
      ...args,
    ),
};
const defaultAuthorize: AnalyticsAuthorization = async (videoId, token) => {
  const { authorizeMediaClaim } = await import('./playback.service.js');
  const { video, capability } = await authorizeMediaClaim(videoId, token);
  return {
    videoId: video.id,
    viewerId: capability.viewerId,
    processingVersion: capability.processingVersion,
  };
};

/** Playback analytics is independent of WatchProgress; no client-supplied ownerId. */
export function createPlaybackAnalyticsService(
  store: AnalyticsStore = defaultStore,
  authorize: AnalyticsAuthorization = defaultAuthorize,
  clock: () => Date = () => new Date(),
): AnalyticsHandler {
  return async (videoId, payload) => {
    const authorized = await authorize(videoId, payload.playbackToken);
    const identity: SessionIdentity = {
      id: payload.sessionId,
      videoId: authorized.videoId,
      viewerId: authorized.viewerId,
      processingVersion: authorized.processingVersion,
    };
    const now = clock();
    await store.ensure(identity, now);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const previous = await store.read(identity.id);
      if (!previous) throw new AppError(409, 'ANALYTICS_SESSION_NOT_FOUND', 'Session unavailable');
      if (
        previous.videoId !== identity.videoId ||
        previous.processingVersion !== identity.processingVersion ||
        previous.viewerId !== identity.viewerId
      ) {
        throw new AppError(
          409,
          'ANALYTICS_SESSION_CONFLICT',
          'Playback session belongs to a different viewer or video',
        );
      }
      const result = nextPlaybackSessionState(previous, payload, now);
      if (result.ignored) {
        return PlaybackAnalyticsAckSchema.parse({
          sessionId: identity.id,
          acceptedSequence: previous.lastSequence,
          watchedSeconds: previous.watchedSeconds,
          qualifiedView: Boolean(previous.qualifiedAt),
          completed: Boolean(previous.completedAt),
        });
      }
      const updated = await store.advance(identity.id, previous.lastSequence, {
        sequence: payload.sequence,
        positionSeconds: payload.positionSeconds,
        increment: result.increment,
        qualifiedAt: result.qualifiedAt,
        completedAt: result.completedAt,
        now,
      });
      if (updated) {
        return PlaybackAnalyticsAckSchema.parse({
          sessionId: identity.id,
          acceptedSequence: payload.sequence,
          watchedSeconds: result.watchedSeconds,
          qualifiedView: Boolean(result.qualifiedAt),
          completed: Boolean(result.completedAt),
        });
      }
    }
    throw new AppError(409, 'ANALYTICS_CONCURRENT_UPDATE', 'Retry analytics event');
  };
}

export const reportPlaybackAnalytics = createPlaybackAnalyticsService();
