import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { rateLimitStoreMode } from '../config/env.js';
import { RedisRateLimitStore } from './redis-rate-limit-store.js';

type RateLimitPolicy = {
  scope: 'auth-register' | 'auth-login' | 'auth-refresh' | 'playback-analytics';
  windowMs: number;
  limit: number;
  message?: string;
};

export function createRequestRateLimiter(policy: RateLimitPolicy): RequestHandler {
  return rateLimit({
    windowMs: policy.windowMs,
    limit: policy.limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    passOnStoreError: false,
    ...(rateLimitStoreMode === 'redis'
      ? { store: new RedisRateLimitStore(policy.scope, policy.windowMs) }
      : {}),
    ...(policy.message
      ? {
          handler: (req, res) => {
            res.status(429).json({
              success: false,
              error: { code: 'RATE_LIMITED', message: policy.message },
              requestId: req.requestId ?? null,
            });
          },
        }
      : {}),
  });
}
