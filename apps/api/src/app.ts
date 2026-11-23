import type { RefreshHandler } from './services/refresh.service.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { allowedOrigins } from './config/env.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import type { LogoutHandler } from './services/session.service.js';
import type { RequestHandler } from 'express';
import type { RegisterHandler, LoginHandler } from './services/auth.service.js';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { AppError } from './utils/app-error.js';
import type { ReadinessReport } from './lib/readiness.js';

type AppOptions = {
  readiness?: () => Promise<ReadinessReport>;
  register?: RegisterHandler;
  login?: LoginHandler;
  refresh?: RefreshHandler;
  logout?: LogoutHandler;
  authenticate?: RequestHandler;
};

/** Configure Express without starting an HTTP listener (testable app factory). */
export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLoggerMiddleware);
  app.use(requestIdMiddleware);
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
        } else {
          callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
        }
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/health', createHealthRouter(options.readiness));
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      register: options.register,
      login: options.login,
      refresh: options.refresh,
      logout: options.logout,
    }),
  );
  app.use('/api/v1/users', createUserRouter(options.authenticate));
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
