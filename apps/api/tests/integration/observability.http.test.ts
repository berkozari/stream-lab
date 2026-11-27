import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Server } from 'node:http';
import { createApp } from '../../src/app.js';

async function serve(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

test('server correlation ID is stable across response and error body, not client controlled', async () => {
  const server = await serve();
  try {
    const supplied = 'spoofed-correlation-id';
    const response = await fetch(`${server.url}/api/v1/not-found`, {
      headers: { 'x-request-id': supplied },
    });
    const body = (await response.json()) as { requestId: string };
    const assigned = response.headers.get('x-request-id');
    assert.equal(response.status, 404);
    assert.ok(assigned);
    assert.notEqual(assigned, supplied);
    assert.match(assigned, /^[a-f0-9-]{36}$/i);
    assert.equal(body.requestId, assigned);
  } finally {
    await server.close();
  }
});

test('liveness and readiness stay on existing routes with no public metrics endpoint', async () => {
  const server = await serve();
  try {
    const health = await fetch(`${server.url}/api/v1/health`);
    assert.equal(health.status, 200);
    const metrics = await fetch(`${server.url}/api/v1/metrics`);
    assert.equal(metrics.status, 404);
  } finally {
    await server.close();
  }
});
