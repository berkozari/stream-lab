import { z } from 'zod';
import { IdSchema } from './common.js';
import { WatchProgressResponseSchema } from './playback.js';
import { VideoVisibilitySchema } from './video.js';

/** Progress is reported by an authenticated viewer, never for an arbitrary userId. */
export const UpdateWatchProgressRequestSchema = z.strictObject({
  positionSeconds: z.number().int().min(0).max(864000),
  completed: z.boolean().optional(),
});

export const WatchHistoryQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(30).default(20),
  cursor: z.string().min(1).max(512).optional(),
});

export const WatchHistoryItemSchema = WatchProgressResponseSchema.extend({
  video: z.object({
    id: IdSchema,
    title: z.string(),
    durationSeconds: z.number().int().nonnegative().nullable(),
    visibility: VideoVisibilitySchema,
  }),
});
export const WatchHistoryResponseSchema = z.object({
  items: z.array(WatchHistoryItemSchema),
  nextCursor: z.string().nullable(),
});

export type UpdateWatchProgressRequest = z.infer<typeof UpdateWatchProgressRequestSchema>;
export type WatchHistoryQuery = z.infer<typeof WatchHistoryQuerySchema>;
export type WatchHistoryResponse = z.infer<typeof WatchHistoryResponseSchema>;
