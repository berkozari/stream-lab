import { Router, type RequestHandler } from 'express';
import { getCurrentUserController } from '../controllers/user.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export function createUserRouter(authenticate: RequestHandler = requireAuth): Router {
  const router = Router();
  router.get('/me', authenticate, getCurrentUserController);
  return router;
}
