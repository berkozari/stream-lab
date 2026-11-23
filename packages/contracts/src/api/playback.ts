import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema } from './common.js';

export const PlaybackResponseSchema = z.object({
  videoId: IdSchema,
  protocol: z.literal('HLS'),
  manifestUrl: z.url(),
  expiresAt: IsoDateTimeSchema,
});
export const WatchProgressRequestSchema = z.object({
  positionSeconds: z.number().int().nonnegative(),
  completed: z.boolean().default(false),
});
export const WatchProgressResponseSchema = z.object({
  videoId: IdSchema,
  positionSeconds: z.number().int().nonnegative(),
  completedAt: IsoDateTimeSchema.nullable(),
  lastWatchedAt: IsoDateTimeSchema,
});

export type PlaybackResponse = z.infer<typeof PlaybackResponseSchema>;
export type WatchProgressRequest = z.input<typeof WatchProgressRequestSchema>;
export type WatchProgressResponse = z.infer<typeof WatchProgressResponseSchema>;
