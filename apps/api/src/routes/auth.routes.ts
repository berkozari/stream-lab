import { createRefreshController } from '../controllers/refresh.controller.js';
import { createLogoutController } from '../controllers/session.controller.js';
import type { LogoutHandler } from '../services/session.service.js';
import type { RefreshHandler } from '../services/refresh.service.js';
import { Router } from 'express';
import { createRequestRateLimiter } from '../lib/request-rate-limit.js';
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
  const registerLimit = createRequestRateLimiter({
    scope: 'auth-register',
    windowMs: 15 * 60 * 1000,
    limit: 8,
    message: 'Too many registration attempts',
  });
  router.post(
    '/register',
    registerLimit,
    requirePreAuthCsrf,
    validateBody(RegisterRequestSchema),
    createRegisterController(options.register),
  );
  const loginLimit = createRequestRateLimiter({
    scope: 'auth-login',
    windowMs: 15 * 60 * 1000,
    limit: 10,
    message: 'Too many login attempts',
  });
  router.post(
    '/login',
    loginLimit,
    requirePreAuthCsrf,
    validateBody(LoginRequestSchema),
    createLoginController(options.login),
  );
  const refreshLimit = createRequestRateLimiter({
    scope: 'auth-refresh',
    windowMs: 15 * 60 * 1000,
    limit: 60,
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
