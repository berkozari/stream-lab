/** STREAM-008.6: Authenticated, owner-scoped single-video analytics. */
import { z } from 'zod';
import { IdSchema } from './common.js';
import { CreatorAnalyticsRangeSchema } from './creator-analytics.js';

const Count = z.number().int().nonnegative();
const Percent = z.number().min(0).max(100);
const DailyPointSchema = z.strictObject({
  day: z.iso.date(),
  qualifiedViews: Count,
  watchSeconds: Count,
  completedViews: Count,
});

export const CreatorVideoAnalyticsResponseSchema = z.strictObject({
  videoId: IdSchema,
  title: z.string().min(1),
  range: CreatorAnalyticsRangeSchema,
  asOf: z.iso.datetime(),
  rangeStart: z.iso.datetime().nullable(),
  qualifiedViews: Count,
  watchSeconds: Count,
  completedViews: Count,
  averageWatchSeconds: Count,
  completionRatePercent: Percent,
  /** UTC calendar days; only returned for 7d and 30d. */
  daily: z.array(DailyPointSchema).max(32),
});

export type CreatorVideoAnalyticsResponse = z.infer<typeof CreatorVideoAnalyticsResponseSchema>;
