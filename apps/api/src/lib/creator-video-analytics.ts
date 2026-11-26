/** STREAM-008.6: Pure UTC trend formatting for video analytics. */

export type VideoAnalyticsTotals = {
  qualifiedViews: number;
  watchSeconds: number;
  completedViews: number;
};
export type VideoAnalyticsDailyRow = {
  day: string;
  qualifiedViews: number;
  watchSeconds: number;
  completedViews: number;
};

/** Rolling windows may touch eight or thirty-one UTC dates. Never fabricate data for all-time. */
export function fillUtcVideoAnalyticsDays(
  since: Date | null,
  asOf: Date,
  rows: VideoAnalyticsDailyRow[],
): VideoAnalyticsDailyRow[] {
  if (!since) return [];
  const start = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));
  const end = Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate());
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const result: VideoAnalyticsDailyRow[] = [];
  for (let date = start.getTime(); date <= end; date += 86_400_000) {
    const day = new Date(date).toISOString().slice(0, 10);
    const row = byDay.get(day);
    result.push({
      day,
      qualifiedViews: row?.qualifiedViews ?? 0,
      watchSeconds: row?.watchSeconds ?? 0,
      completedViews: row?.completedViews ?? 0,
    });
    if (result.length > 32) throw new Error('Analytics window exceeds 32 UTC days');
  }
  return result;
}

export function calculateCreatorVideoAnalytics(totals: VideoAnalyticsTotals) {
  const qualifiedViews = Math.max(0, totals.qualifiedViews);
  const completedViews = Math.min(qualifiedViews, Math.max(0, totals.completedViews));
  const watchSeconds = Math.max(0, totals.watchSeconds);
  return {
    qualifiedViews,
    completedViews,
    watchSeconds,
    averageWatchSeconds: qualifiedViews ? Math.round(watchSeconds / qualifiedViews) : 0,
    completionRatePercent: qualifiedViews
      ? Math.round((completedViews / qualifiedViews) * 1000) / 10
      : 0,
  };
}
