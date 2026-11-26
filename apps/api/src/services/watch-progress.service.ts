import {
  IdSchema,
  WatchHistoryResponseSchema,
  WatchProgressResponseSchema,
  type UpdateWatchProgressRequest,
  type WatchHistoryQuery,
  type WatchHistoryResponse,
  type WatchProgressResponse,
} from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';

export type WatchViewer = { userId: string; role: 'USER' | 'ADMIN' };
export type WatchListMode = 'history' | 'continue';
export type ProgressRecord = {
  videoId: string;
  positionSeconds: number;
  completedAt: Date | null;
  lastWatchedAt: Date;
};
export type ProgressVideo = { id: string; durationSeconds: number | null };
export type HistoryRecord = ProgressRecord & {
  video: {
    id: string;
    title: string;
    durationSeconds: number | null;
    visibility: 'PRIVATE' | 'UNLISTED' | 'PUBLIC';
  };
};
export type WatchCursor = { lastWatchedAt: Date; videoId: string };
export type WatchStore = {
  eligibleVideo: (videoId: string, viewer: WatchViewer) => Promise<ProgressVideo | null>;
  read: (userId: string, videoId: string) => Promise<ProgressRecord | null>;
  save: (
    userId: string,
    videoId: string,
    positionSeconds: number,
    completedAt: Date | null,
    lastWatchedAt: Date,
  ) => Promise<ProgressRecord>;
  list: (params: {
    viewer: WatchViewer;
    mode: WatchListMode;
    limit: number;
    cursor?: WatchCursor;
  }) => Promise<HistoryRecord[]>;
};

const notFound = () => new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
const badCursor = () => new AppError(422, 'INVALID_CURSOR', 'Invalid watch history cursor');

function response(record: ProgressRecord): WatchProgressResponse {
  return WatchProgressResponseSchema.parse({
    videoId: record.videoId,
    positionSeconds: record.positionSeconds,
    completedAt: record.completedAt?.toISOString() ?? null,
    lastWatchedAt: record.lastWatchedAt.toISOString(),
  });
}

/** An opaque position, scoped to the exact viewer and list mode; not an authorization token. */
function encodeCursor(record: ProgressRecord, viewer: WatchViewer, mode: WatchListMode): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      u: viewer.userId,
      m: mode,
      t: record.lastWatchedAt.toISOString(),
      i: record.videoId,
    }),
  ).toString('base64url');
}

function decodeCursor(
  raw: string | undefined,
  viewer: WatchViewer,
  mode: WatchListMode,
): WatchCursor | undefined {
  if (raw === undefined) return undefined;
  try {
    if (!/^[A-Za-z0-9_-]+$/.test(raw)) throw badCursor();
    const value: unknown = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || !value) throw badCursor();
    const cursor = value as Record<string, unknown>;
    if (
      cursor.v !== 1 ||
      cursor.u !== viewer.userId ||
      cursor.m !== mode ||
      typeof cursor.t !== 'string' ||
      typeof cursor.i !== 'string' ||
      !IdSchema.safeParse(cursor.i).success ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(cursor.t)
    )
      throw badCursor();
    const lastWatchedAt = new Date(cursor.t);
    if (!Number.isFinite(lastWatchedAt.getTime()) || lastWatchedAt.toISOString() !== cursor.t)
      throw badCursor();
    return { lastWatchedAt, videoId: cursor.i };
  } catch {
    throw badCursor();
  }
}

export type WatchProgressHandler = ReturnType<typeof createWatchProgressService>;

export function createWatchProgressService(
  store: WatchStore,
  clock: () => Date = () => new Date(),
) {
  async function ensureEligible(videoId: string, viewer: WatchViewer): Promise<ProgressVideo> {
    const video = await store.eligibleVideo(videoId, viewer);
    if (!video) throw notFound();
    return video;
  }

  return {
    async get(videoId: string, viewer: WatchViewer): Promise<WatchProgressResponse | null> {
      await ensureEligible(videoId, viewer);
      const record = await store.read(viewer.userId, videoId);
      return record ? response(record) : null;
    },
    async save(
      videoId: string,
      viewer: WatchViewer,
      input: UpdateWatchProgressRequest,
    ): Promise<WatchProgressResponse> {
      const video = await ensureEligible(videoId, viewer);
      const duration = video.durationSeconds;
      // Prevent impossible progress on known-duration videos. Client-provided duration is never trusted.
      const seconds =
        duration === null ? input.positionSeconds : Math.min(input.positionSeconds, duration);
      const completed =
        input.completed === true ||
        (duration !== null && duration > 0 && seconds >= duration * 0.95);
      const now = clock();
      const saved = await store.save(viewer.userId, videoId, seconds, completed ? now : null, now);
      return response(saved);
    },
    async list(
      viewer: WatchViewer,
      mode: WatchListMode,
      query: WatchHistoryQuery,
    ): Promise<WatchHistoryResponse> {
      const cursor = decodeCursor(query.cursor, viewer, mode);
      const rows = await store.list({ viewer, mode, limit: query.limit, cursor });
      const slice = rows.slice(0, query.limit);
      const nextCursor =
        rows.length > query.limit && slice.length > 0
          ? encodeCursor(slice[slice.length - 1]!, viewer, mode)
          : null;
      return WatchHistoryResponseSchema.parse({
        items: slice.map((row) => ({ ...response(row), video: row.video })),
        nextCursor,
      });
    },
  };
}

// Delay loading Prisma until a live database operation; unit tests inject an isolated store.
export const watchProgress: WatchProgressHandler = createWatchProgressService({
  eligibleVideo: async (...args) =>
    (await import('../repositories/watch-progress.repository.js')).findEligibleWatchVideo(...args),
  read: async (...args) =>
    (await import('../repositories/watch-progress.repository.js')).readWatchProgress(...args),
  save: async (...args) =>
    (await import('../repositories/watch-progress.repository.js')).saveWatchProgress(...args),
  list: async (params) =>
    (await import('../repositories/watch-progress.repository.js')).listWatchProgress(params),
});
