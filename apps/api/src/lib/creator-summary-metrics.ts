import type { Video } from '@streamlab/contracts';

export type CreatorVideoStatusCount = { status: Video['status']; count: number };

/** Calculate metadata-only KPIs. No WatchProgress-based "views" or invented watch time. */
export function summarizeCreatorVideos(
  rows: readonly CreatorVideoStatusCount[],
  publishedVideos: number,
) {
  const counts = new Map(rows.map((row) => [row.status, row.count]));
  const count = (status: Video['status']) => counts.get(status) ?? 0;
  return {
    totalVideos: rows.reduce((total, row) => total + row.count, 0),
    draftVideos: count('DRAFT'),
    processingVideos:
      count('UPLOADING') + count('UPLOADED') + count('QUEUED') + count('PROCESSING'),
    readyVideos: count('READY'),
    publishedVideos,
    failedVideos: count('FAILED'),
  };
}
