/** STREAM-009.4: retention is deliberately longer than every rolling analytics window. */
export const DEFAULT_ANALYTICS_RETENTION_DAYS = 120;
export const MIN_ANALYTICS_RETENTION_DAYS = 60;
export const MAX_ANALYTICS_RETENTION_DAYS = 3650;
export const DEFAULT_ANALYTICS_PURGE_BATCH_SIZE = 500;
export const MAX_ANALYTICS_PURGE_BATCH_SIZE = 1000;
export const MAX_ANALYTICS_PURGE_BATCHES = 100;

export function parseBoundedInteger(value: string, name: string, min: number, max: number) {
  if (!/^[0-9]+$/.test(value)) throw new Error(`${name} must be a whole number`);
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < min || n > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return n;
}

export function analyticsRetentionCutoff(now: Date, retentionDays: number): Date {
  if (
    !Number.isSafeInteger(retentionDays) ||
    retentionDays < MIN_ANALYTICS_RETENTION_DAYS ||
    retentionDays > MAX_ANALYTICS_RETENTION_DAYS
  ) {
    throw new Error(
      `retentionDays must be ${MIN_ANALYTICS_RETENTION_DAYS}-${MAX_ANALYTICS_RETENTION_DAYS}`,
    );
  }
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid retention clock');
  return new Date(now.getTime() - retentionDays * 86_400_000);
}

/** Database BIGINT is intentional; reject unsafe JS conversion rather than lose counts. */
export function safeAnalyticsNumber(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error('Analytics aggregate exceeds safe numeric range');
  }
  return result;
}

export type ArchivedTotals = {
  videoId: string;
  qualifiedViews: bigint;
  watchSeconds: bigint;
  completedViews: bigint;
};

export function mergeQualifiedArchive(
  active: { videoId: string; _count: { _all: number }; _sum: { watchedSeconds: number | null } }[],
  archive: ArchivedTotals[],
) {
  const merged = new Map(
    active.map((row) => [
      row.videoId,
      { ...row, _count: { ...row._count }, _sum: { ...row._sum } },
    ]),
  );
  for (const old of archive) {
    const qualifiedViews = safeAnalyticsNumber(old.qualifiedViews);
    const watched = safeAnalyticsNumber(old.watchSeconds);
    const existing = merged.get(old.videoId);
    if (existing) {
      existing._count._all += qualifiedViews;
      existing._sum.watchedSeconds = (existing._sum.watchedSeconds ?? 0) + watched;
    } else {
      merged.set(old.videoId, {
        videoId: old.videoId,
        _count: { _all: qualifiedViews },
        _sum: { watchedSeconds: watched },
      });
    }
  }
  return [...merged.values()];
}

export function mergeCompletedArchive(
  active: { videoId: string; _count: { _all: number } }[],
  archive: ArchivedTotals[],
) {
  const merged = new Map(active.map((row) => [row.videoId, { ...row, _count: { ...row._count } }]));
  for (const old of archive) {
    const completedViews = safeAnalyticsNumber(old.completedViews);
    const existing = merged.get(old.videoId);
    if (existing) existing._count._all += completedViews;
    else merged.set(old.videoId, { videoId: old.videoId, _count: { _all: completedViews } });
  }
  return [...merged.values()];
}
