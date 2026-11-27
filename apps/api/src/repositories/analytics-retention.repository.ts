import { prisma } from '../config/database.js';

export type RetentionQueryClient = Pick<typeof prisma, 'playbackAnalyticsSession' | '$queryRaw'>;

/** Read-only dry-run: both cutoffs guard against a row with inconsistent timestamps. */
export async function countExpiredAnalyticsSessions(
  db: RetentionQueryClient,
  cutoff: Date,
): Promise<number> {
  return db.playbackAnalyticsSession.count({
    where: { lastEventAt: { lt: cutoff }, startedAt: { lt: cutoff } },
  });
}

type PurgeResultRow = { deletedCount: bigint; archiveUpdates: bigint };

/**
 * ONE atomic PostgreSQL statement: lock a bounded batch, delete it, and upsert
 * all-time qualified totals. If the archive write fails, the delete rolls back.
 * SKIP LOCKED avoids racing a concurrent heartbeat or another purge worker.
 * Never run a Redis operation inside this statement.
 */
export async function purgeExpiredAnalyticsBatch(
  db: RetentionQueryClient,
  cutoff: Date,
  batchSize: number,
): Promise<{ deletedCount: number; archiveUpdates: number }> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
    throw new Error('batchSize must be between 1 and 1000');
  }
  const rows = await db.$queryRaw<PurgeResultRow[]>`
    WITH locked AS (
      SELECT "id"
      FROM "PlaybackAnalyticsSession"
      WHERE "lastEventAt" < ${cutoff}::timestamptz
        AND "startedAt" < ${cutoff}::timestamptz
      ORDER BY "lastEventAt" ASC, "id" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    ), removed AS (
      DELETE FROM "PlaybackAnalyticsSession" AS s
      USING locked
      WHERE s."id" = locked."id"
      RETURNING s."videoId", s."qualifiedAt", s."completedAt", s."watchedSeconds"
    ), per_video AS (
      SELECT "videoId",
        COUNT(*) FILTER (WHERE "qualifiedAt" IS NOT NULL)::bigint AS qualified_views,
        COALESCE(SUM(GREATEST("watchedSeconds", 0)) FILTER
          (WHERE "qualifiedAt" IS NOT NULL), 0)::bigint AS watch_seconds,
        COUNT(*) FILTER (WHERE "qualifiedAt" IS NOT NULL AND "completedAt" IS NOT NULL)::bigint AS completed_views
      FROM removed
      GROUP BY "videoId"
    ), saved AS (
      INSERT INTO "VideoAnalyticsArchive"
        ("videoId", "qualifiedViews", "watchSeconds", "completedViews", "updatedAt")
      SELECT "videoId", qualified_views, watch_seconds, completed_views, NOW()
      FROM per_video
      WHERE qualified_views > 0
      ON CONFLICT ("videoId") DO UPDATE SET
        "qualifiedViews" = "VideoAnalyticsArchive"."qualifiedViews" + EXCLUDED."qualifiedViews",
        "watchSeconds" = "VideoAnalyticsArchive"."watchSeconds" + EXCLUDED."watchSeconds",
        "completedViews" = "VideoAnalyticsArchive"."completedViews" + EXCLUDED."completedViews",
        "updatedAt" = NOW()
      RETURNING "videoId"
    )
    SELECT (SELECT COUNT(*) FROM removed)::bigint AS "deletedCount",
           (SELECT COUNT(*) FROM saved)::bigint AS "archiveUpdates"
  `;
  const result = rows[0];
  if (!result) throw new Error('Retention query did not return batch counts');
  return {
    deletedCount: Number(result.deletedCount),
    archiveUpdates: Number(result.archiveUpdates),
  };
}
