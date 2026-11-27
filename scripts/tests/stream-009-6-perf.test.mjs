import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import {
  nearestRankPercentile,
  parseHealthProbeArgs,
  sampleHealthEndpoint,
  validateHealthUrl,
} from '../lib/stream-009-6-perf.mjs';

test('defaults are strictly bounded and only target local liveness', () => {
  assert.deepEqual(parseHealthProbeArgs([]), {
    url: 'http://127.0.0.1:4000/api/v1/health',
    requests: 40,
    concurrency: 2,
    timeoutMs: 1_500,
    maxErrors: 0,
  });
  assert.equal(validateHealthUrl('http://[::1]:4000/api/v1/health').hostname, '[::1]');
});

test('rejects nonlocal hosts, queries, credentials, redirects and other endpoints', () => {
  for (const url of [
    'https://example.com/api/v1/health',
    'http://127.0.0.2:4000/api/v1/health',
    'http://127.0.0.1:4000/api/v1/auth/logout',
    'http://127.0.0.1:4000/api/v1/health?token=abc',
    'http://user:secret@127.0.0.1:4000/api/v1/health',
    'http://127.0.0.1:4000/api/v1/health#fragment',
    'not a url',
  ]) {
    assert.throws(() => validateHealthUrl(url));
  }
});

test('rejects duplicates, incomplete options, invalid integers and unsafe capacity', () => {
  for (const args of [
    ['--requests', '201'],
    ['--concurrency', '9'],
    ['--timeout-ms', '1'],
    ['--requests', '-1'],
    ['--requests', '3.5'],
    ['--requests'],
    ['--unknown', '1'],
    ['--requests', '3', '--requests', '4'],
    ['--requests', '4', '--max-errors', '5'],
    ['--p95-ms', '0'],
  ])
    assert.throws(() => parseHealthProbeArgs(args));
});

test('nearest rank quantiles handle small sample sets and do not mutate measurements', () => {
  const data = [5, 2, 9, 4, 6];
  assert.equal(nearestRankPercentile(data, 50), 5);
  assert.equal(nearestRankPercentile(data, 95), 9);
  assert.deepEqual(data, [5, 2, 9, 4, 6]);
  assert.throws(() => nearestRankPercentile([], 95));
});

test('a mocked fetch never exceeds concurrency or request budget', async () => {
  let active = 0;
  let peak = 0;
  const calls = [];
  const request = async (_url, init) => {
    active += 1;
    peak = Math.max(peak, active);
    calls.push(init);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return new Response(JSON.stringify({ status: 'ok', service: 'api' }), { status: 200 });
  };
  const result = await sampleHealthEndpoint(
    { ...parseHealthProbeArgs([]), requests: 13, concurrency: 3 },
    request,
  );
  assert.equal(result.sent, 13);
  assert.equal(result.successes, 13);
  assert.equal(result.errors, 0);
  assert.ok(peak <= 3);
  assert.equal(calls.length, 13);
  assert.ok(calls.every((call) => call.method === 'GET' && call.redirect === 'manual'));
  assert.equal(result.passed, true);
});

test('bad status, bad payload and transport failures become bounded errors', async () => {
  let i = 0;
  const result = await sampleHealthEndpoint(
    { ...parseHealthProbeArgs([]), requests: 3, concurrency: 1, maxErrors: 2 },
    async () => {
      i += 1;
      if (i === 1) return new Response('{}', { status: 200 });
      if (i === 2)
        return new Response(JSON.stringify({ status: 'ok', service: 'api' }), { status: 302 });
      throw new Error('connection reset');
    },
  );
  assert.equal(result.errors, 3);
  assert.equal(result.p95Ms, null);
  assert.equal(result.passed, false);
});

test('local real HTTP fixture exercises client and reports correct response count', async () => {
  let count = 0;
  const server = createServer((_req, res) => {
    count += 1;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'api' }));
  });
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const result = await sampleHealthEndpoint({
      ...parseHealthProbeArgs([]),
      url: `http://127.0.0.1:${address.port}/api/v1/health`,
      requests: 7,
      concurrency: 2,
    });
    assert.equal(count, 7);
    assert.equal(result.errors, 0);
    assert.equal(result.sent, 7);
    assert.ok(result.p95Ms !== null && result.p95Ms >= 0);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test('optional p95 threshold fails when measured local latency exceeds budget', async () => {
  const config = { ...parseHealthProbeArgs([]), requests: 2, concurrency: 1, p95Ms: 1 };
  const result = await sampleHealthEndpoint(config, async () => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    return new Response(JSON.stringify({ status: 'ok', service: 'api' }), { status: 200 });
  });
  assert.equal(result.errors, 0);
  assert.ok(result.p95Ms !== null && result.p95Ms > 1);
  assert.equal(result.passed, false);
});

test('error budget is explicit: one bad response may pass only when opted in', async () => {
  const config = { ...parseHealthProbeArgs([]), requests: 2, concurrency: 1, maxErrors: 1 };
  let calls = 0;
  const result = await sampleHealthEndpoint(config, async () => {
    calls += 1;
    return new Response(
      JSON.stringify({ status: calls === 1 ? 'unhealthy' : 'ok', service: 'api' }),
    );
  });
  assert.equal(result.errors, 1);
  assert.equal(result.successes, 1);
  assert.equal(result.passed, true);
});
