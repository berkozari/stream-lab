import type { RequestHandler } from 'express';
import { IdSchema } from '@streamlab/contracts';
import { completeUpload, type CompleteUploadHandler } from '../services/upload-complete.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';

export function createUploadCompleteController(
  handler: CompleteUploadHandler = completeUpload,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const id = IdSchema.safeParse(req.params.uploadId);
    if (!id.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid upload ID');
    const complete = await handler(id.data, req.auth.userId);
    res.set('Cache-Control', 'no-store');
    sendSuccess(res, complete, 200);
  };
}
