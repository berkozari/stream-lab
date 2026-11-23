import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';

export const notFoundMiddleware: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found'));
};
