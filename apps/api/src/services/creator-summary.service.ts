import { CreatorSummaryResponseSchema, type CreatorSummaryResponse } from '@streamlab/contracts';
import {
  summarizeCreatorVideos,
  type CreatorVideoStatusCount,
} from '../lib/creator-summary-metrics.js';

export type CreatorSummaryReader = (ownerId: string) => Promise<{
  statusCounts: CreatorVideoStatusCount[];
  publishedVideos: number;
}>;
export type CreatorSummaryHandler = (ownerId: string) => Promise<CreatorSummaryResponse>;

/** Inject the reader for tests; only load Prisma when a live request needs it. */
export function createCreatorSummaryService(
  reader: CreatorSummaryReader = async (ownerId) =>
    (await import('../repositories/creator-summary.repository.js')).readCreatorSummary(ownerId),
): CreatorSummaryHandler {
  return async (ownerId) => {
    const counts = await reader(ownerId);
    return CreatorSummaryResponseSchema.parse(
      summarizeCreatorVideos(counts.statusCounts, counts.publishedVideos),
    );
  };
}

export const getCreatorSummary = createCreatorSummaryService();
