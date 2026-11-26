import { Router, type RequestHandler } from 'express';
import { UpdateWatchProgressRequestSchema } from '@streamlab/contracts';
import { requireAuth } from '../middlewares/auth.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import {
  createGetProgressController,
  createPutProgressController,
  createListProgressController,
} from '../controllers/watch-progress.controller.js';
import type { WatchProgressHandler } from '../services/watch-progress.service.js';

/** Routes are mounted at /api/v1/users/me; all data is scoped to the verified JWT session. */
export function createWatchProgressRouter(
  authenticate: RequestHandler = requireAuth,
  service?: WatchProgressHandler,
): Router {
  const router = Router();
  const handlers = service;
  // Prevent storage of personal progress and errors by intermediate caches.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    next();
  });
  router.get('/watch-progress/:videoId', authenticate, createGetProgressController(handlers));
  router.put(
    '/watch-progress/:videoId',
    authenticate,
    validateBody(UpdateWatchProgressRequestSchema),
    createPutProgressController(handlers),
  );
  router.get('/watch-history', authenticate, createListProgressController('history', handlers));
  router.get(
    '/continue-watching',
    authenticate,
    createListProgressController('continue', handlers),
  );
  return router;
}
