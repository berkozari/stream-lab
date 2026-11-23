import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';

export const requestLoggerMiddleware = pinoHttp({
  logger,
  customProps: (req) => ({
    requestId: 'requestId' in req && typeof req.requestId === 'string' ? req.requestId : undefined,
  }),
});
