import { z } from 'zod';

const VideoCountSchema = z.number().int().nonnegative();

/** Snapshot of creator-owned, non-deleted video metadata; not view analytics. */
export const CreatorSummaryResponseSchema = z.strictObject({
  totalVideos: VideoCountSchema,
  draftVideos: VideoCountSchema,
  processingVideos: VideoCountSchema,
  readyVideos: VideoCountSchema,
  publishedVideos: VideoCountSchema,
  failedVideos: VideoCountSchema,
});

export type CreatorSummaryResponse = z.infer<typeof CreatorSummaryResponseSchema>;
