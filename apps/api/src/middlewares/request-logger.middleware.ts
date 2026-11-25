import { pinoHttp } from 'pino-http';
import { logger } from '../lib/logger.js';
import { stdSerializers } from 'pino';

export const requestLoggerMiddleware = pinoHttp({
  logger,
  // Playback URLs contain bearer-capability tokens. Never put query strings in HTTP logs.
  serializers: {
    req: (request) => {
      const serialized = stdSerializers.req(request);
      return { ...serialized, url: serialized.url?.split('?')[0] };
    },
  },
  customProps: (req) => ({
    requestId: 'requestId' in req && typeof req.requestId === 'string' ? req.requestId : undefined,
  }),
});
