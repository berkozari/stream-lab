import type { RequestHandler } from 'express';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';
import {
  getCreatorSummary,
  type CreatorSummaryHandler,
} from '../services/creator-summary.service.js';

export function createCreatorSummaryController(
  handler: CreatorSummaryHandler = getCreatorSummary,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await handler(req.auth.userId));
  };
}
