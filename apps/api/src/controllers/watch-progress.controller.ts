import type { RequestHandler } from 'express';
import {
  IdSchema,
  WatchHistoryQuerySchema,
  type UpdateWatchProgressRequest,
} from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';
import {
  watchProgress,
  type WatchListMode,
  type WatchViewer,
  type WatchProgressHandler,
} from '../services/watch-progress.service.js';

function viewerOf(req: Parameters<RequestHandler>[0]): WatchViewer {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return { userId: req.auth.userId, role: req.auth.user.role };
}
function idOf(value: unknown): string {
  const result = IdSchema.safeParse(value);
  if (!result.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
  return result.data;
}
function noStore(res: Parameters<RequestHandler>[1]) {
  res.set('Cache-Control', 'private, no-store');
}

export function createGetProgressController(
  handler: WatchProgressHandler = watchProgress,
): RequestHandler {
  return async (req, res) => {
    const result = await handler.get(idOf(req.params.videoId), viewerOf(req));
    noStore(res);
    sendSuccess(res, result);
  };
}
export function createPutProgressController(
  handler: WatchProgressHandler = watchProgress,
): RequestHandler {
  return async (req, res) => {
    const result = await handler.save(
      idOf(req.params.videoId),
      viewerOf(req),
      req.body as UpdateWatchProgressRequest,
    );
    noStore(res);
    sendSuccess(res, result);
  };
}
export function createListProgressController(
  mode: WatchListMode,
  handler: WatchProgressHandler = watchProgress,
): RequestHandler {
  return async (req, res) => {
    const parsed = WatchHistoryQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(
        422,
        'VALIDATION_ERROR',
        'Invalid history query',
        parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    const result = await handler.list(viewerOf(req), mode, parsed.data);
    noStore(res);
    sendSuccess(res, result);
  };
}
