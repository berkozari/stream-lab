import {
  VideoListQuerySchema,
  VideoListResponseSchema,
  VideoResponseSchema,
  type Video,
} from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import {
  decodeVideoCursor,
  encodeVideoCursor,
  type VideoCursorContext,
} from '../lib/video-cursor.js';
import {
  findVideoForDetail,
  findVideoPage,
  type VideoReadFilter,
  type VideoReadRecord,
} from '../repositories/video-read.repository.js';

type ParsedVideoListQuery = ReturnType<typeof VideoListQuerySchema.parse>;
export type VideoViewer = { userId: string; role: 'USER' | 'ADMIN' };
export type VideoListInput = {
  scope: 'public' | 'mine';
  query: ParsedVideoListQuery;
  userId?: string;
};
export type VideoListHandler = (
  input: VideoListInput,
) => Promise<ReturnType<typeof VideoListResponseSchema.parse>>;
export type VideoDetailHandler = (videoId: string, viewer?: VideoViewer) => Promise<Video>;
export type VideoPageReader = (filter: VideoReadFilter) => Promise<VideoReadRecord[]>;
export type VideoDetailReader = (id: string) => Promise<VideoReadRecord | null>;

export function serializeVideo(record: VideoReadRecord): Video {
  return VideoResponseSchema.parse({
    ...record,
    publishedAt: record.publishedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
}

export function createVideoListService(
  readPage: VideoPageReader = findVideoPage,
): VideoListHandler {
  return async ({ scope, userId, query }) => {
    if (scope === 'mine' && !userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }
    const context: VideoCursorContext = {
      scope: scope === 'public' ? 'public' : `mine:${userId}`,
      ...(query.q ? { q: query.q } : {}),
      ...(query.category ? { category: query.category } : {}),
    };
    const cursor = decodeVideoCursor(query.cursor, context);
    const records = await readPage({
      scope,
      userId,
      limit: query.limit,
      q: query.q,
      category: query.category,
      cursor,
    });
    const page = records.slice(0, query.limit);
    const last = page.at(-1);
    const nextCursor =
      records.length > query.limit && last
        ? encodeVideoCursor({ createdAt: last.createdAt, id: last.id }, context)
        : null;
    return VideoListResponseSchema.parse({ items: page.map(serializeVideo), nextCursor });
  };
}

/** Unauthorized reads of hidden videos return 404 to avoid exposing their existence. */
export function createVideoDetailService(
  readDetail: VideoDetailReader = findVideoForDetail,
): VideoDetailHandler {
  return async (videoId, viewer) => {
    const record = await readDetail(videoId);
    if (!record) throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    const privileged = viewer?.role === 'ADMIN' || viewer?.userId === record.ownerId;
    const publicOrUnlisted =
      record.status === 'READY' &&
      record.publishedAt !== null &&
      (record.visibility === 'PUBLIC' || record.visibility === 'UNLISTED');
    if (!privileged && !publicOrUnlisted) {
      throw new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');
    }
    return serializeVideo(record);
  };
}

export const listVideos = createVideoListService();
export const getVideoDetail = createVideoDetailService();
