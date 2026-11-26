import { z } from 'zod';
import { IdSchema } from './common.js';

/** A signed playback capability authorizes both anonymous and signed-in sessions. */
export const PlaybackAnalyticsEventSchema = z.object({
  sessionId: IdSchema,
  sequence: z.number().int().min(0).max(1_000_000),
  kind: z.enum(['START', 'HEARTBEAT', 'PAUSE', 'SEEK', 'ENDED']),
  positionSeconds: z.number().int().min(0).max(864_000),
  playedSeconds: z.number().int().min(0).max(30),
  playbackToken: z.string().min(1).max(2_048),
});

export const PlaybackAnalyticsAckSchema = z.object({
  sessionId: IdSchema,
  acceptedSequence: z.number().int().min(0),
  watchedSeconds: z.number().int().nonnegative(),
  qualifiedView: z.boolean(),
  completed: z.boolean(),
});

export type PlaybackAnalyticsEvent = z.infer<typeof PlaybackAnalyticsEventSchema>;
export type PlaybackAnalyticsAck = z.infer<typeof PlaybackAnalyticsAckSchema>;
