import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { test } from 'node:test';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Redis } from 'ioredis';
import { RedisRateLimitStore } from '../../src/lib/redis-rate-limit-store.js';
import { errorMiddleware } from '../../src/middlewares/error.middleware.js';

function mockRedis(): Redis {
  const counters = new Map<string, number>();
  return {
    async eval(script: string, _count: number, key: string) {
      if (!script.includes("'INCR'")) return 0;
      const value = (counters.get(key) ?? 0) + 1;
      counters.set(key, value);
      return [value, 60_000];
    },
    async del(key: string) {
      return Number(counters.delete(key));
    },
  } as unknown as Redis;
}

async function start(serverApp: ReturnType<typeof express>) {
  const server: Server = serverApp.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return { server, url: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}

function app(redis: Redis, trustedProxy: false | string[] = false) {
  const instance = express();
  instance.set('trust proxy', trustedProxy);
  instance.use(
    rateLimit({
      windowMs: 60_000,
      limit: 2,
      store: new RedisRateLimitStore('auth-login', 60_000, () => redis),
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      passOnStoreError: false,
    }),
  );
  instance.get('/', (req, res) => res.json({ ip: req.ip }));
  instance.use(errorMiddleware);
  return instance;
}

test('HTTP limits are shared between replicas and spoofed XFF is ignored by default', async () => {
  const redis = mockRedis();
  const first = await start(app(redis));
  const second = await start(app(redis));
  try {
    const a = await fetch(first.url, { headers: { 'x-forwarded-for': '198.51.100.30' } });
    const b = await fetch(second.url, { headers: { 'x-forwarded-for': '203.0.113.40' } });
    const c = await fetch(first.url, { headers: { 'x-forwarded-for': '192.0.2.50' } });
    assert.deepEqual([a.status, b.status, c.status], [200, 200, 429]);
    const body = (await a.json()) as { ip: string };
    assert.match(body.ip, /^(?:127\.0\.0\.1|::ffff:127\.0\.0\.1)$/i);
  } finally {
    await Promise.all([close(first.server), close(second.server)]);
  }
});

test('a configured proxy address uses XFF from that trusted hop', async () => {
  const instance = await start(app(mockRedis(), ['127.0.0.1/32']));
  try {
    const a = await fetch(instance.url, { headers: { 'x-forwarded-for': '198.51.100.30' } });
    const b = await fetch(instance.url, { headers: { 'x-forwarded-for': '203.0.113.40' } });
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    assert.equal(((await a.json()) as { ip: string }).ip, '198.51.100.30');
  } finally {
    await close(instance.server);
  }
});

test('Redis unavailability does not fall back to unbounded access', async () => {
  const down = {
    eval: async () => {
      throw new Error('Redis not available');
    },
  } as unknown as Redis;
  const instance = await start(app(down));
  try {
    const response = await fetch(instance.url);
    assert.equal(response.status, 503);
    const payload = (await response.json()) as { error: { code: string } };
    assert.equal(payload.error.code, 'RATE_LIMIT_STORE_UNAVAILABLE');
  } finally {
    await close(instance.server);
  }
});
