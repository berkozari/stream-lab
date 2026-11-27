/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { CompletedVideoRow, QualifiedVideoRow } from '../lib/creator-analytics-metrics.js';
import { mergeCompletedArchive, mergeQualifiedArchive } from '../lib/analytics-retention.js';

/** All queries are owner-scoped and exclude soft-deleted videos. */
function analyticsWhere(
  ownerId: string,
  rangeStart: Date | null,
): Prisma.PlaybackAnalyticsSessionWhereInput {
  return {
    video: { is: { ownerId, deletedAt: null } },
    ...(rangeStart ? { startedAt: { gte: rangeStart } } : {}),
    qualifiedAt: { not: null },
  };
}

export async function readQualifiedVideoGroups(
  ownerId: string,
  rangeStart: Date | null,
): Promise<QualifiedVideoRow[]> {
  const groups = await prisma.playbackAnalyticsSession.groupBy({
    by: ['videoId'],
    where: analyticsWhere(ownerId, rangeStart),
    _count: { _all: true },
    _sum: { watchedSeconds: true },
  });

  if (rangeStart) return groups;
  const archived = await prisma.videoAnalyticsArchive.findMany({
    where: { video: { is: { ownerId, deletedAt: null } } },
    select: { videoId: true, qualifiedViews: true, watchSeconds: true, completedViews: true },
  });
  return mergeQualifiedArchive(groups, archived);
}

export async function readCompletedVideoGroups(
  ownerId: string,
  rangeStart: Date | null,
): Promise<CompletedVideoRow[]> {
  const groups = await prisma.playbackAnalyticsSession.groupBy({
    by: ['videoId'],
    where: {
      ...analyticsWhere(ownerId, rangeStart),
      completedAt: { not: null },
    },
    _count: { _all: true },
  });

  if (rangeStart) return groups;
  const archived = await prisma.videoAnalyticsArchive.findMany({
    where: { video: { is: { ownerId, deletedAt: null } } },
    select: { videoId: true, qualifiedViews: true, watchSeconds: true, completedViews: true },
  });
  return mergeCompletedArchive(groups, archived);
}

/** Fetch only the top candidate titles, never raw viewer-session rows. */
export async function readCreatorAnalyticsVideoTitles(ownerId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.video.findMany({
    where: { id: { in: ids }, ownerId, deletedAt: null },
    select: { id: true, title: true },
  });
}
