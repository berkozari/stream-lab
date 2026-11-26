/** STREAM-008.6: Creator-only video analytics detail. */
import type { RequestHandler } from 'express';
import { CreatorAnalyticsRangeSchema } from '@streamlab/contracts';
import { z } from 'zod';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';
import {
  getCreatorVideoAnalytics,
  type CreatorVideoAnalyticsHandler,
} from '../services/creator-video-analytics.service.js';

export function createCreatorVideoAnalyticsController(
  handler: CreatorVideoAnalyticsHandler = getCreatorVideoAnalytics,
): RequestHandler {
  return async (req, res) => {
    if (!req.auth) throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    const videoId = z.uuid().safeParse(req.params.videoId);
    const range = CreatorAnalyticsRangeSchema.safeParse(req.query.range ?? '7d');
    if (!videoId.success || !range.success) {
      throw new AppError(422, 'VALIDATION_ERROR', 'Invalid analytics request');
    }
    res.set('Cache-Control', 'private, no-store');
    sendSuccess(res, await handler(req.auth.userId, videoId.data, range.data));
  };
}
