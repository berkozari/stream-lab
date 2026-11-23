import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { allowedOrigins } from './config/env.js';
import { createHealthRouter } from './routes/health.routes.js';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { AppError } from './utils/app-error.js';
import type { ReadinessReport } from './lib/readiness.js';

type AppOptions = { readiness?: () => Promise<ReadinessReport> };

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
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
