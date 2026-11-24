import type { RequestHandler } from 'express';
import { IdSchema, VideoListQuerySchema } from '@streamlab/contracts';
import {
  getVideoDetail,
  listVideos,
  type VideoDetailHandler,
  type VideoListHandler,
} from '../services/video-read.service.js';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';

function parseListQuery(query: unknown): ReturnType<typeof VideoListQuerySchema.parse> {
  const parsed = VideoListQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new AppError(
      422,
      'VALIDATION_ERROR',
      'Request validation failed',
      parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

export function createListVideoController(
  scope: 'public' | 'mine',
  handler: VideoListHandler = listVideos,
): RequestHandler {
  return async (req, res) => {
    if (scope === 'mine' && !req.auth)
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const data = await handler({
      scope,
      userId: req.auth?.userId,
      query: parseListQuery(req.query),
    });
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, data);
  };
}

export function createVideoDetailController(
  handler: VideoDetailHandler = getVideoDetail,
): RequestHandler {
  return async (req, res) => {
    const id = IdSchema.safeParse(req.params.videoId);
    if (!id.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
    const viewer = req.auth ? { userId: req.auth.userId, role: req.auth.user.role } : undefined;
    const video = await handler(id.data, viewer);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, video);
  };
}
