import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { test } from 'node:test';
import { createApp } from '../../src/app.js';

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const server: Server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

test('foreign CORS origin is rejected without reflecting attacker origin', async () => {
  await withServer(async (base) => {
    const origin = 'https://attacker.example.invalid';
    const response = await fetch(`${base}/api/v1/health`, { headers: { origin } });
    assert.equal(response.status, 403);
    assert.notEqual(response.headers.get('access-control-allow-origin'), origin);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, 'CORS_ORIGIN_DENIED');
  });
});

test('oversized JSON is rejected before hitting the auth handler and never reflected', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ payload: 'x'.repeat(1024 * 1024 + 100) }),
    });
    assert.equal(response.status, 413);
    const text = await response.text();
    const body = JSON.parse(text) as { error: { code: string }; requestId: string };
    assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');
    assert.equal(body.requestId, response.headers.get('x-request-id'));
    assert.ok(text.length < 1_024);
  });
});

test('malformed JSON returns safe 400 and server-issued request ID', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'malicious-id' },
      body: '{"password":"secret",',
    });
    assert.equal(response.status, 400);
    const text = await response.text();
    const body = JSON.parse(text) as { error: { code: string }; requestId: string };
    assert.equal(body.error.code, 'INVALID_JSON');
    assert.equal(body.requestId, response.headers.get('x-request-id'));
    assert.notEqual(body.requestId, 'malicious-id');
    assert.ok(!text.includes('secret'));
  });
});
