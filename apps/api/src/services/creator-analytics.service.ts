/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import {
  CreatorAnalyticsResponseSchema,
  type CreatorAnalyticsRange,
  type CreatorAnalyticsResponse,
} from '@streamlab/contracts';
import {
  creatorAnalyticsStart,
  rankCreatorAnalytics,
  type CompletedVideoRow,
  type QualifiedVideoRow,
} from '../lib/creator-analytics-metrics.js';

export type CreatorAnalyticsReader = {
  qualified(ownerId: string, since: Date | null): Promise<QualifiedVideoRow[]>;
  completed(ownerId: string, since: Date | null): Promise<CompletedVideoRow[]>;
  titles(ownerId: string, ids: string[]): Promise<{ id: string; title: string }[]>;
};
export type CreatorAnalyticsHandler = (
  ownerId: string,
  range: CreatorAnalyticsRange,
) => Promise<CreatorAnalyticsResponse>;

const defaultReader: CreatorAnalyticsReader = {
  qualified: async (...args) =>
    (await import('../repositories/creator-analytics.repository.js')).readQualifiedVideoGroups(
      ...args,
    ),
  completed: async (...args) =>
    (await import('../repositories/creator-analytics.repository.js')).readCompletedVideoGroups(
      ...args,
    ),
  titles: async (...args) =>
    (
      await import('../repositories/creator-analytics.repository.js')
    ).readCreatorAnalyticsVideoTitles(...args),
};

export function createCreatorAnalyticsService(
  reader: CreatorAnalyticsReader = defaultReader,
  clock: () => Date = () => new Date(),
): CreatorAnalyticsHandler {
  return async (ownerId, range) => {
    const asOf = clock();
    const since = creatorAnalyticsStart(range, asOf);
    const [qualified, completed] = await Promise.all([
      reader.qualified(ownerId, since),
      reader.completed(ownerId, since),
    ]);
    const ranked = rankCreatorAnalytics(qualified, completed);
    const titles = await reader.titles(
      ownerId,
      ranked.topVideos.map((row) => row.videoId),
    );
    const titleById = new Map(titles.map((row) => [row.id, row.title]));
    const topVideos = ranked.topVideos.flatMap((row) => {
      const title = titleById.get(row.videoId);
      return title ? [{ ...row, title }] : [];
    });
    return CreatorAnalyticsResponseSchema.parse({
      ...ranked,
      range,
      asOf: asOf.toISOString(),
      rangeStart: since?.toISOString() ?? null,
      topVideos,
    });
  };
}

export const getCreatorAnalytics = createCreatorAnalyticsService();
