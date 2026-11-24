import type { RequestHandler } from 'express';
import { IdSchema, type SignUploadRequest } from '@streamlab/contracts';
import { signUpload, type SignUploadHandler } from '../services/upload-sign.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';

export function createUploadSignController(
  handler: SignUploadHandler = signUpload,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const id = IdSchema.safeParse(req.params.uploadId);
    if (!id.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid upload ID');
    const signed = await handler(id.data, req.auth.userId, req.body as SignUploadRequest);
    res.set('Cache-Control', 'no-store');
    res.set('Referrer-Policy', 'no-referrer');
    sendSuccess(res, signed, 200);
  };
}
