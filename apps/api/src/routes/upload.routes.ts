import type { MultipartUploadService } from '../services/upload-multipart.service.js';
import {
  multipartSignController,
  multipartListController,
  multipartCompleteController,
  multipartAbortController,
} from '../controllers/upload-multipart.controller.js';
import { Router, type RequestHandler } from 'express';
import {
  SignUploadRequestSchema,
  SignMultipartPartRequestSchema,
  CompleteMultipartUploadRequestSchema,
} from '@streamlab/contracts';
import { createUploadSignController } from '../controllers/upload-sign.controller.js';
import { createUploadCompleteController } from '../controllers/upload-complete.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import type { SignUploadHandler } from '../services/upload-sign.service.js';
import type { CompleteUploadHandler } from '../services/upload-complete.service.js';

export type UploadRouterOptions = {
  multipart?: MultipartUploadService;
  authenticate?: RequestHandler;
  sign?: SignUploadHandler;
  complete?: CompleteUploadHandler;
};

export function createUploadRouter(options: UploadRouterOptions = {}): Router {
  const router = Router();
  router.post(
    '/:uploadId/sign',
    options.authenticate ?? requireAuth,
    validateBody(SignUploadRequestSchema),
    createUploadSignController(options.sign),
  );
  router.post(
    '/:uploadId/complete',
    options.authenticate ?? requireAuth,
    createUploadCompleteController(options.complete),
  );
  router.post(
    '/:uploadId/parts/sign',
    options.authenticate ?? requireAuth,
    validateBody(SignMultipartPartRequestSchema),
    multipartSignController(options.multipart),
  );
  router.get(
    '/:uploadId/parts',
    options.authenticate ?? requireAuth,
    multipartListController(options.multipart),
  );
  router.post(
    '/:uploadId/multipart/complete',
    options.authenticate ?? requireAuth,
    validateBody(CompleteMultipartUploadRequestSchema),
    multipartCompleteController(options.multipart),
  );
  router.delete(
    '/:uploadId/multipart',
    options.authenticate ?? requireAuth,
    multipartAbortController(options.multipart),
  );
  return router;
}
