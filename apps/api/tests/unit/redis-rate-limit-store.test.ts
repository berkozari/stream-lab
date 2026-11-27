import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Redis } from 'ioredis';
import { RedisRateLimitStore } from '../../src/lib/redis-rate-limit-store.js';
import { parseTrustedProxyCidrs } from '../../src/lib/trusted-proxy.js';

function fakeRedis() {
  const counters = new Map<string, number>();
  const calls: string[] = [];
  const client = {
    async eval(script: string, _count: number, key: string, _ttl?: string) {
      calls.push(key);
      if (script.includes("'INCR'")) {
        const hits = (counters.get(key) ?? 0) + 1;
        counters.set(key, hits);
        return [hits, 60_000];
      }
      if (script.includes("'DECR'")) {
        const hits = Math.max(0, (counters.get(key) ?? 0) - 1);
        counters.set(key, hits);
        return hits;
      }
      throw new Error('Unknown Lua operation');
    },
    async del(key: string) {
      return Number(counters.delete(key));
    },
  } as unknown as Redis;
  return { client, counters, calls };
}

test('two Redis rate-limit stores share a scope and do not share other scopes', async () => {
  const { client, calls } = fakeRedis();
  const first = new RedisRateLimitStore('auth-login', 60_000, () => client);
  const second = new RedisRateLimitStore('auth-login', 60_000, () => client);
  const separate = new RedisRateLimitStore('auth-register', 60_000, () => client);
  assert.equal(first.localKeys, false);
  assert.equal((await first.increment('ip-a')).totalHits, 1);
  const response = await second.increment('ip-a');
  assert.equal(response.totalHits, 2);
  assert.ok(response.resetTime.getTime() > Date.now());
  assert.equal((await separate.increment('ip-a')).totalHits, 1);
  assert.notEqual(calls[1], calls[2]);
  await second.decrement('ip-a');
  assert.equal((await first.increment('ip-a')).totalHits, 2);
  await first.resetKey('ip-a');
  assert.equal((await second.increment('ip-a')).totalHits, 1);
});

test('unavailable or malformed Redis reply fails closed with a safe error', async () => {
  const broken = {
    eval: async () => {
      throw new Error('redis://private-user:private-password@internal-host');
    },
  } as unknown as Redis;
  const store = new RedisRateLimitStore('auth-login', 60_000, () => broken);
  await assert.rejects(
    () => store.increment('ip-a'),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { statusCode?: number }).statusCode, 503);
      assert.equal((error as { code?: string }).code, 'RATE_LIMIT_STORE_UNAVAILABLE');
      assert.equal(error.message.includes('private-password'), false);
      return true;
    },
  );
  const invalid = { eval: async () => [0, -1] } as unknown as Redis;
  await assert.rejects(
    () => new RedisRateLimitStore('auth-login', 60_000, () => invalid).increment('ip-a'),
    { code: 'RATE_LIMIT_STORE_UNAVAILABLE' },
  );
});

test('trusted proxies only accept literal, bounded IPs/CIDRs', () => {
  assert.deepEqual(parseTrustedProxyCidrs(''), []);
  assert.deepEqual(parseTrustedProxyCidrs('127.0.0.1/32, ::1'), ['127.0.0.1/32', '::1']);
  for (const invalid of [
    'all',
    'localhost',
    '0.0.0.0/0',
    '::/0',
    '192.0.2.0/33',
    'not-an-ip',
    '192.0.2.1,',
    '192.0.2.1/20/3',
  ]) {
    assert.throws(() => parseTrustedProxyCidrs(invalid), /TRUST_PROXY_CIDRS/);
  }
});
