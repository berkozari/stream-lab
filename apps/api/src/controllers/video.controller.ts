import type { RequestHandler } from 'express';
import type { CreateVideoRequest } from '@streamlab/contracts';
import { createVideo, type CreateVideoHandler } from '../services/video.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';

export function createCreateVideoController(
  handler: CreateVideoHandler = createVideo,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    // validateBody ran first: req.body is the parsed and whitelisted Zod payload.
    const video = await handler(req.auth.userId, req.body as CreateVideoRequest);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, video, 201);
  };
}
