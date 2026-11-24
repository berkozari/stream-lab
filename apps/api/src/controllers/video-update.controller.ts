import type { RequestHandler } from 'express';
import { IdSchema, type UpdateVideoRequest } from '@streamlab/contracts';
import { updateVideo, type UpdateVideoHandler } from '../services/video-update.service.js';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';

export function createUpdateVideoController(
  handler: UpdateVideoHandler = updateVideo,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const id = IdSchema.safeParse(req.params.videoId);
    if (!id.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
    const updated = await handler(id.data, req.auth.userId, req.body as UpdateVideoRequest);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, updated);
  };
}
