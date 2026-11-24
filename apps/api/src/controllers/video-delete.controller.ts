import type { RequestHandler } from 'express';
import { IdSchema } from '@streamlab/contracts';
import { deleteVideo, type DeleteVideoHandler } from '../services/video-delete.service.js';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';

export function createDeleteVideoController(
  handler: DeleteVideoHandler = deleteVideo,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const parsedId = IdSchema.safeParse(req.params.videoId);
    if (!parsedId.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
    const result = await handler(parsedId.data, req.auth.userId);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, result, 202);
  };
}
