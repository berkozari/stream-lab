import type { Store } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { AppError } from '../utils/app-error.js';

// Single atomic command for a fixed window. TTL begins with the first hit and
// is recovered if a legacy/corrupt counter has no expiration.
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return {hits, ttl}
`;

const DECREMENT_SCRIPT = `
local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
if hits > 0 then return redis.call('DECR', KEYS[1]) end
return 0
`;

/**
 * Shared across replicas, distinct keys per route scope. A Redis failure blocks
 * the guarded request rather than silently switching to a per-process counter.
 */
export class RedisRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix: string;

  constructor(
    scope: string,
    private readonly windowMs: number,
    private readonly redisClient: () => Redis = getRedisClient,
  ) {
    if (!/^[a-z][a-z0-9-]*$/.test(scope) || !Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error('Invalid Redis rate limit scope or window');
    }
    this.prefix = `streamlab:rate-limit:v1:${scope}:`;
  }

  private key(identifier: string): string {
    return `${this.prefix}${identifier}`;
  }

  async increment(identifier: string): Promise<{ totalHits: number; resetTime: Date }> {
    try {
      const reply: unknown = await this.redisClient().eval(
        INCREMENT_SCRIPT,
        1,
        this.key(identifier),
        String(this.windowMs),
      );
      if (!Array.isArray(reply) || reply.length !== 2) throw new Error('Invalid counter reply');
      const hits = Number(reply[0]);
      const ttl = Number(reply[1]);
      if (!Number.isSafeInteger(hits) || hits < 1 || !Number.isSafeInteger(ttl) || ttl < 1) {
        throw new Error('Invalid counter values');
      }
      return { totalHits: hits, resetTime: new Date(Date.now() + ttl) };
    } catch {
      // Never expose Redis URLs, keys, or internal details to API clients.
      throw new AppError(503, 'RATE_LIMIT_STORE_UNAVAILABLE', 'Request temporarily unavailable');
    }
  }

  async decrement(identifier: string): Promise<void> {
    try {
      await this.redisClient().eval(DECREMENT_SCRIPT, 1, this.key(identifier));
    } catch {
      throw new AppError(503, 'RATE_LIMIT_STORE_UNAVAILABLE', 'Request temporarily unavailable');
    }
  }

  async resetKey(identifier: string): Promise<void> {
    try {
      await this.redisClient().del(this.key(identifier));
    } catch {
      throw new AppError(503, 'RATE_LIMIT_STORE_UNAVAILABLE', 'Request temporarily unavailable');
    }
  }
}
