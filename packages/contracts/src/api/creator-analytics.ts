/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import { z } from 'zod';
import { IdSchema } from './common.js';

export const CreatorAnalyticsRangeSchema = z.enum(['7d', '30d', 'all']);
export type CreatorAnalyticsRange = z.infer<typeof CreatorAnalyticsRangeSchema>;

const Count = z.number().int().nonnegative();
const Percent = z.number().min(0).max(100);
const TopVideoSchema = z.strictObject({
  videoId: IdSchema,
  title: z.string().min(1),
  qualifiedViews: Count,
  watchSeconds: Count,
  completedViews: Count,
  completionRatePercent: Percent,
});

/** Only qualified playback sessions are included in these aggregates. */
export const CreatorAnalyticsResponseSchema = z.strictObject({
  range: CreatorAnalyticsRangeSchema,
  asOf: z.iso.datetime(),
  rangeStart: z.iso.datetime().nullable(),
  qualifiedViews: Count,
  watchSeconds: Count,
  completedViews: Count,
  averageWatchSeconds: Count,
  completionRatePercent: Percent,
  topVideos: z.array(TopVideoSchema).max(5),
});

export type CreatorAnalyticsResponse = z.infer<typeof CreatorAnalyticsResponseSchema>;
