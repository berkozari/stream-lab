/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import type { RequestHandler } from 'express';
import { CreatorAnalyticsRangeSchema } from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';
import {
  getCreatorAnalytics,
  type CreatorAnalyticsHandler,
} from '../services/creator-analytics.service.js';

export function createCreatorAnalyticsController(
  handler: CreatorAnalyticsHandler = getCreatorAnalytics,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const result = CreatorAnalyticsRangeSchema.safeParse(req.query.range ?? '7d');
    if (!result.success) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Invalid analytics date range');
    }
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await handler(req.auth.userId, result.data));
  };
}
