import { Router, type RequestHandler } from 'express';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { createCreatorSummaryController } from '../controllers/creator-summary.controller.js';
import { createCreatorAnalyticsController } from '../controllers/creator-analytics.controller.js';
import { createCreatorVideoAnalyticsController } from '../controllers/creator-video-analytics.controller.js';
import type { CreatorSummaryHandler } from '../services/creator-summary.service.js';
import type { CreatorAnalyticsHandler } from '../services/creator-analytics.service.js';

export function createCreatorRouter(
  authenticate: RequestHandler = requireAuth,
  summary?: CreatorSummaryHandler,
  analytics?: CreatorAnalyticsHandler,
): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  router.get('/summary', authenticate, createCreatorSummaryController(summary));
  router.get('/analytics', authenticate, createCreatorAnalyticsController(analytics));
  router.get('/videos/:videoId/analytics', authenticate, createCreatorVideoAnalyticsController());
  return router;
}
