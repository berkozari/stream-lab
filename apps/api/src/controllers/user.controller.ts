import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';

export const getCurrentUserController: RequestHandler = (req, res) => {
  if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
  res.set('Cache-Control', 'no-store');
  sendSuccess(res, req.auth.user);
};
