/** STREAM-008.6: Aggregates at the database; never reads or exposes raw viewer sessions. */
import { prisma } from '../config/database.js';
import { safeAnalyticsNumber } from '../lib/analytics-retention.js';
import type {
  VideoAnalyticsDailyRow,
  VideoAnalyticsTotals,
} from '../lib/creator-video-analytics.js';

export async function findCreatorVideoForAnalytics(ownerId: string, videoId: string) {
  return prisma.video.findFirst({
    where: { id: videoId, ownerId, deletedAt: null },
    select: { id: true, title: true },
  });
}

export async function readCreatorVideoAnalyticsTotals(
  ownerId: string,
  videoId: string,
  since: Date | null,
): Promise<VideoAnalyticsTotals> {
  const where = {
    videoId,
    video: { is: { ownerId, deletedAt: null } },
    qualifiedAt: { not: null },
    ...(since ? { startedAt: { gte: since } } : {}),
  };
  const [aggregate, completedViews, archived] = await Promise.all([
    prisma.playbackAnalyticsSession.aggregate({
      where,
      _count: { _all: true },
      _sum: { watchedSeconds: true },
    }),
    prisma.playbackAnalyticsSession.count({
      where: { ...where, completedAt: { not: null } },
    }),
    since
      ? Promise.resolve(null)
      : prisma.videoAnalyticsArchive.findFirst({
          where: { videoId, video: { is: { ownerId, deletedAt: null } } },
          select: { qualifiedViews: true, watchSeconds: true, completedViews: true },
        }),
  ]);
  return {
    qualifiedViews:
      aggregate._count._all + (archived ? safeAnalyticsNumber(archived.qualifiedViews) : 0),
    watchSeconds:
      (aggregate._sum.watchedSeconds ?? 0) +
      (archived ? safeAnalyticsNumber(archived.watchSeconds) : 0),
    completedViews: completedViews + (archived ? safeAnalyticsNumber(archived.completedViews) : 0),
  };
}

type DatabaseDay = {
  day: string;
  qualifiedViews: bigint;
  watchSeconds: bigint;
  completedViews: bigint;
};

/** Parameterized SQL; UTC bucket grouping runs in PostgreSQL, not the API process. */
export async function readCreatorVideoAnalyticsDays(
  ownerId: string,
  videoId: string,
  since: Date,
): Promise<VideoAnalyticsDailyRow[]> {
  const rows = await prisma.$queryRaw<DatabaseDay[]>`
    SELECT to_char(s."startedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS "day",
      COUNT(*)::bigint AS "qualifiedViews",
      COALESCE(SUM(s."watchedSeconds"), 0)::bigint AS "watchSeconds",
      COUNT(*) FILTER (WHERE s."completedAt" IS NOT NULL)::bigint AS "completedViews"
    FROM "PlaybackAnalyticsSession" AS s
    JOIN "Video" AS v ON v."id" = s."videoId"
    WHERE s."videoId" = ${videoId}::uuid
      AND v."ownerId" = ${ownerId}::uuid
      AND v."deletedAt" IS NULL
      AND s."qualifiedAt" IS NOT NULL
      AND s."startedAt" >= ${since}::timestamptz
    GROUP BY 1 ORDER BY 1 ASC
  `;
  return rows.map((row) => ({
    day: row.day,
    qualifiedViews: Number(row.qualifiedViews),
    watchSeconds: Number(row.watchSeconds),
    completedViews: Number(row.completedViews),
  }));
}
