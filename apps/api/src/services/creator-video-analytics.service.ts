/** STREAM-008.6: Owner-scoped single-video performance. */
import {
  CreatorVideoAnalyticsResponseSchema,
  type CreatorAnalyticsRange,
  type CreatorVideoAnalyticsResponse,
} from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import { creatorAnalyticsStart } from '../lib/creator-analytics-metrics.js';
import {
  calculateCreatorVideoAnalytics,
  fillUtcVideoAnalyticsDays,
  type VideoAnalyticsDailyRow,
  type VideoAnalyticsTotals,
} from '../lib/creator-video-analytics.js';

export type CreatorVideoAnalyticsReader = {
  video(ownerId: string, videoId: string): Promise<{ id: string; title: string } | null>;
  totals(ownerId: string, videoId: string, since: Date | null): Promise<VideoAnalyticsTotals>;
  days(ownerId: string, videoId: string, since: Date): Promise<VideoAnalyticsDailyRow[]>;
};
export type CreatorVideoAnalyticsHandler = (
  ownerId: string,
  videoId: string,
  range: CreatorAnalyticsRange,
) => Promise<CreatorVideoAnalyticsResponse>;

const defaultReader: CreatorVideoAnalyticsReader = {
  video: async (...args) =>
    (
      await import('../repositories/creator-video-analytics.repository.js')
    ).findCreatorVideoForAnalytics(...args),
  totals: async (...args) =>
    (
      await import('../repositories/creator-video-analytics.repository.js')
    ).readCreatorVideoAnalyticsTotals(...args),
  days: async (...args) =>
    (
      await import('../repositories/creator-video-analytics.repository.js')
    ).readCreatorVideoAnalyticsDays(...args),
};

export function createCreatorVideoAnalyticsService(
  reader: CreatorVideoAnalyticsReader = defaultReader,
  clock: () => Date = () => new Date(),
): CreatorVideoAnalyticsHandler {
  return async (ownerId, videoId, range) => {
    const video = await reader.video(ownerId, videoId);
    if (!video) throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    const asOf = clock();
    const since = creatorAnalyticsStart(range, asOf);
    const [totals, sparseDays] = await Promise.all([
      reader.totals(ownerId, videoId, since),
      since ? reader.days(ownerId, videoId, since) : Promise.resolve([]),
    ]);
    return CreatorVideoAnalyticsResponseSchema.parse({
      videoId: video.id,
      title: video.title,
      range,
      asOf: asOf.toISOString(),
      rangeStart: since?.toISOString() ?? null,
      ...calculateCreatorVideoAnalytics(totals),
      daily: fillUtcVideoAnalyticsDays(since, asOf, sparseDays),
    });
  };
}

export const getCreatorVideoAnalytics = createCreatorVideoAnalyticsService();
