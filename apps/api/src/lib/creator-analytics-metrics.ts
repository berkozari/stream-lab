/** STREAM-008.5: Creator analytics aggregation/dashboard. */
/** Pure aggregation over already owner-filtered database groupBy rows. */
export type QualifiedVideoRow = {
  videoId: string;
  _count: { _all: number };
  _sum: { watchedSeconds: number | null };
};
export type CompletedVideoRow = {
  videoId: string;
  _count: { _all: number };
};
export type RankedVideo = {
  videoId: string;
  qualifiedViews: number;
  watchSeconds: number;
  completedViews: number;
  completionRatePercent: number;
};

export function completionPercent(completed: number, qualified: number): number {
  if (qualified === 0) return 0;
  return Math.round((Math.min(qualified, completed) / qualified) * 1000) / 10;
}

export function rankCreatorAnalytics(
  qualified: QualifiedVideoRow[],
  completed: CompletedVideoRow[],
): {
  qualifiedViews: number;
  watchSeconds: number;
  completedViews: number;
  averageWatchSeconds: number;
  completionRatePercent: number;
  topVideos: RankedVideo[];
} {
  const completedByVideo = new Map(completed.map((row) => [row.videoId, row._count._all]));
  const rows = qualified.map((row) => {
    const qualifiedViews = row._count._all;
    const watched = Math.max(0, row._sum.watchedSeconds ?? 0);
    const completedViews = Math.min(qualifiedViews, completedByVideo.get(row.videoId) ?? 0);
    return {
      videoId: row.videoId,
      qualifiedViews,
      watchSeconds: watched,
      completedViews,
      completionRatePercent: completionPercent(completedViews, qualifiedViews),
    };
  });
  const qualifiedViews = rows.reduce((sum, row) => sum + row.qualifiedViews, 0);
  const watchSeconds = rows.reduce((sum, row) => sum + row.watchSeconds, 0);
  const completedViews = rows.reduce((sum, row) => sum + row.completedViews, 0);
  rows.sort(
    (a, b) =>
      b.qualifiedViews - a.qualifiedViews ||
      b.watchSeconds - a.watchSeconds ||
      a.videoId.localeCompare(b.videoId),
  );
  return {
    qualifiedViews,
    watchSeconds,
    completedViews,
    averageWatchSeconds: qualifiedViews ? Math.round(watchSeconds / qualifiedViews) : 0,
    completionRatePercent: completionPercent(completedViews, qualifiedViews),
    topVideos: rows.slice(0, 5),
  };
}

/** UTC rolling windows, not calendar periods or viewer time-zone windows. */
export function creatorAnalyticsStart(range: '7d' | '30d' | 'all', now: Date): Date | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}
