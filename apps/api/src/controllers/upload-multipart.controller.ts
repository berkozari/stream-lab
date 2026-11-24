import type { RequestHandler } from 'express';
import {
  IdSchema,
  MultipartPartNumberSchema,
  type CreateMultipartUploadRequest,
  type CompleteMultipartUploadRequest,
} from '@streamlab/contracts';
import {
  multipartUpload,
  type MultipartUploadService,
} from '../services/upload-multipart.service.js';
import { sendSuccess } from '../utils/api-response.js';
import { AppError } from '../utils/app-error.js';

function ownerId(req: Parameters<RequestHandler>[0]): string {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  return req.auth.userId;
}
function uploadId(req: Parameters<RequestHandler>[0]): string {
  const id = IdSchema.safeParse(req.params.uploadId);
  if (!id.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid upload ID');
  return id.data;
}
const noStore = (res: Parameters<RequestHandler>[1]) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
};

export function multipartCreateController(
  handler: Pick<MultipartUploadService, 'initiate'> = multipartUpload,
): RequestHandler {
  return async (req, res) => {
    const user = ownerId(req);
    const video = IdSchema.safeParse(req.params.videoId);
    if (!video.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
    const result = await handler.initiate(
      video.data,
      user,
      req.body as CreateMultipartUploadRequest,
    );
    noStore(res);
    sendSuccess(res, result, 201);
  };
}
export function multipartSignController(
  handler: MultipartUploadService = multipartUpload,
): RequestHandler {
  return async (req, res) => {
    const user = ownerId(req);
    const id = uploadId(req);
    const part = MultipartPartNumberSchema.safeParse(
      (req.body as { partNumber: unknown }).partNumber,
    );
    if (!part.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid part number');
    const result = await handler.signPart(id, user, part.data);
    noStore(res);
    sendSuccess(res, result, 200);
  };
}
export function multipartListController(
  handler: MultipartUploadService = multipartUpload,
): RequestHandler {
  return async (req, res) => {
    const result = await handler.listParts(uploadId(req), ownerId(req));
    noStore(res);
    sendSuccess(res, result, 200);
  };
}
export function multipartCompleteController(
  handler: MultipartUploadService = multipartUpload,
): RequestHandler {
  return async (req, res) => {
    const result = await handler.complete(
      uploadId(req),
      ownerId(req),
      req.body as CompleteMultipartUploadRequest,
    );
    noStore(res);
    sendSuccess(res, result, 200);
  };
}
export function multipartAbortController(
  handler: MultipartUploadService = multipartUpload,
): RequestHandler {
  return async (req, res) => {
    const result = await handler.abort(uploadId(req), ownerId(req));
    noStore(res);
    sendSuccess(res, result, 200);
  };
}
