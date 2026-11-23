import type { RequestHandler } from 'express';
import { allowedOrigins } from '../config/env.js';
import { equalCsrfToken } from '../lib/auth-security.js';
import { readCsrfContext } from '../lib/auth-cookies.js';
import { AppError } from '../utils/app-error.js';

/** Fail closed for browser auth mutations: origin + session-context token are required. */
export const requirePreAuthCsrf: RequestHandler = (req, _res, next) => {
  const origin = req.get('origin');
  if (!origin || !allowedOrigins.has(origin)) {
    next(new AppError(403, 'CSRF_ORIGIN_DENIED', 'Invalid request origin'));
    return;
  }
  const context = readCsrfContext(req);
  const header = req.get('x-csrf-token');
  if (!context || !header || !equalCsrfToken(context, header)) {
    next(new AppError(403, 'CSRF_TOKEN_INVALID', 'CSRF token is invalid or missing'));
    return;
  }
  next();
};
