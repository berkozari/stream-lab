import type { RequestHandler } from 'express';
import { IdSchema, type PlaybackAnalyticsEvent } from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';
import {
  reportPlaybackAnalytics,
  type AnalyticsHandler,
} from '../services/playback-analytics.service.js';

export function createPlaybackAnalyticsController(
  handler: AnalyticsHandler = reportPlaybackAnalytics,
): RequestHandler {
  return async (req, res) => {
    const id = IdSchema.safeParse(req.params.videoId);
    if (!id.success) throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
    const result = await handler(id.data, req.body as PlaybackAnalyticsEvent);
    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
    sendSuccess(res, result);
  };
}
