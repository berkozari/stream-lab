import type { ErrorRequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { logger } from '../lib/logger.js';

export const errorMiddleware: ErrorRequestHandler = (error: unknown, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  const isMalformedJson =
    error instanceof SyntaxError && typeof error === 'object' && error !== null && 'body' in error;
  const isPayloadTooLarge =
    error !== null && typeof error === 'object' && 'status' in error && error.status === 413;
  const known =
    error instanceof AppError
      ? error
      : isMalformedJson
        ? new AppError(400, 'INVALID_JSON', 'Invalid JSON request body')
        : isPayloadTooLarge
          ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds allowed size')
          : new AppError(500, 'INTERNAL_ERROR', 'Internal server error');

  if (known.statusCode >= 500) {
    logger.error({ err: error, requestId: req.requestId }, 'request failed');
  }

  res.status(known.statusCode).json({
    success: false,
    error: {
      code: known.code,
      message: known.message,
      ...(known.details === undefined ? {} : { details: known.details }),
    },
    requestId: req.requestId ?? null,
  });
};
