import type { RequestHandler } from 'express';
import { IdSchema, type CreateUploadRequest } from '@streamlab/contracts';
import {
  createUploadSession,
  type CreateUploadSessionHandler,
} from '../services/upload-session.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';

export function createUploadSessionController(
  handler: CreateUploadSessionHandler = createUploadSession,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const parsedId = IdSchema.safeParse(req.params.videoId);
    if (!parsedId.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
    const session = await handler(parsedId.data, req.auth.userId, req.body as CreateUploadRequest);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, session, 201);
  };
}
