import { createRefreshController } from '../controllers/refresh.controller.js';
import { createLogoutController } from '../controllers/session.controller.js';
import type { LogoutHandler } from '../services/session.service.js';
import type { RefreshHandler } from '../services/refresh.service.js';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { RegisterRequestSchema, LoginRequestSchema } from '../schemas/auth.schema.js';
import {
  createRegisterController,
  createLoginController,
  getCsrfController,
} from '../controllers/auth.controller.js';
import { requirePreAuthCsrf } from '../middlewares/csrf.middleware.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import type { RegisterHandler, LoginHandler } from '../services/auth.service.js';

export function createAuthRouter(
  options: {
    register?: RegisterHandler;
    login?: LoginHandler;
    refresh?: RefreshHandler;
    logout?: LogoutHandler;
  } = {},
): Router {
  const router = Router();
  router.get('/csrf', getCsrfController);
  // Local starter: process-local limiter. Redis-backed limiter required before multi-instance deployment.
  const registerLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many registration attempts' },
        requestId: req.requestId ?? null,
      });
    },
  });
  router.post(
    '/register',
    registerLimit,
    requirePreAuthCsrf,
    validateBody(RegisterRequestSchema),
    createRegisterController(options.register),
  );
  // Development-only process-local login rate limit; migrate to Redis before multi-instance deployment.
  const loginLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: { code: 'RATE_LIMITED', message: 'Too many login attempts' },
        requestId: req.requestId ?? null,
      });
    },
  });
  router.post(
    '/login',
    loginLimit,
    requirePreAuthCsrf,
    validateBody(LoginRequestSchema),
    createLoginController(options.login),
  );
  // Process-local limiter for development; use Redis storage before scaling out.
  const refreshLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
  });
  router.post(
    '/refresh',
    refreshLimit,
    requirePreAuthCsrf,
    createRefreshController(options.refresh),
  );
  router.post('/logout', requirePreAuthCsrf, createLogoutController(options.logout));
  return router;
}
