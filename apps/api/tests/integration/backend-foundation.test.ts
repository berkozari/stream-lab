import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';
import type { ReadinessReport } from '../../src/lib/readiness.js';

let server: Server;
let baseUrl: string;

const report = (ready: boolean): ReadinessReport => ({
  status: ready ? 'ready' : 'not_ready',
  service: 'api',
  checks: { database: ready ? 'up' : 'down', redis: 'up' },
  timestamp: new Date().toISOString(),
});

before(async () => {
  server = createApp({ readiness: async () => report(true) }).listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test('liveness preserves original contract and has request id', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`);
  const body: unknown = await response.json();
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('x-request-id'));
  assert.equal((body as { status: string }).status, 'ok');
});

test('readiness responds with independent dependency states', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health/ready`);
  const body = (await response.json()) as ReadinessReport;
  assert.equal(response.status, 200);
  assert.deepEqual(body.checks, { database: 'up', redis: 'up' });
});

test('unknown route uses standard 404 response', async () => {
  const response = await fetch(`${baseUrl}/api/v1/unknown`);
  const body = (await response.json()) as { success: boolean; error: { code: string } };
  assert.equal(response.status, 404);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'NOT_FOUND');
});

test('bad JSON returns a safe 400 without stack leakage', async () => {
  const response = await fetch(`${baseUrl}/api/v1/unknown`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{not-json',
  });
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'INVALID_JSON');
});

test('disallowed browser origin is rejected', async () => {
  const response = await fetch(`${baseUrl}/api/v1/health`, {
    headers: { origin: 'https://untrusted.example' },
  });
  assert.equal(response.status, 403);
});

test('down dependencies produce 503 readiness', async () => {
  const degraded = createApp({ readiness: async () => report(false) }).listen(0);
  try {
    await new Promise<void>((resolve) => degraded.once('listening', resolve));
    const address = degraded.address();
    assert.ok(address && typeof address !== 'string');
    const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/health/ready`);
    assert.equal(response.status, 503);
  } finally {
    await new Promise<void>((resolve) => degraded.close(() => resolve()));
  }
});
