import assert from 'node:assert/strict';

const timeoutMs = 6_000;

async function request(url, init = {}, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new Error(`Cannot reach ${url}. Start pnpm dev and check the ports.`, { cause: error });
  }
  return response;
}

async function json(response, label) {
  try {
    return await response.json();
  } catch (error) {
    throw new Error(`${label}: expected valid JSON (HTTP ${response.status})`, { cause: error });
  }
}

function assertRequestId(response, data, label) {
  const header = response.headers.get('x-request-id');
  assert.ok(header, `${label}: X-Request-Id header missing`);
  if (data.requestId !== undefined) {
    assert.equal(data.requestId, header, `${label}: response requestId differs from header`);
  }
}

export async function checkApiHttp({ apiBase, webBase, fetcher = fetch }) {
  const origin = new URL(webBase).origin;
  const api = apiBase.replace(/\/$/, '');

  const live = await request(`${api}/api/v1/health`, {}, fetcher);
  assert.equal(live.status, 200, 'API liveness must return HTTP 200');
  const liveData = await json(live, 'Liveness');
  assert.equal(liveData.status, 'ok');
  assert.equal(liveData.service, 'api');
  assert.ok(!Number.isNaN(Date.parse(liveData.timestamp)), 'Liveness timestamp is invalid');
  assertRequestId(live, liveData, 'Liveness');
  console.info('PASS: API liveness and X-Request-Id');

  const ready = await request(`${api}/api/v1/health/ready`, {}, fetcher);
  const readyData = await json(ready, 'Readiness');
  assert.equal(
    ready.status,
    200,
    `API readiness HTTP ${ready.status}: ${JSON.stringify(readyData)}`,
  );
  assert.equal(readyData.status, 'ready');
  assert.deepEqual(readyData.checks, { database: 'up', redis: 'up' });
  console.info('PASS: API readiness (PostgreSQL + Redis)');

  const cors = await request(`${api}/api/v1/health`, { headers: { Origin: origin } }, fetcher);
  assert.equal(cors.status, 200, `CORS from ${origin} must be allowed`);
  assert.equal(cors.headers.get('access-control-allow-origin'), origin);
  console.info('PASS: API CORS for Web origin');

  const denied = await request(
    `${api}/api/v1/health`,
    { headers: { Origin: 'https://untrusted.example.invalid' } },
    fetcher,
  );
  const deniedBody = await json(denied, 'Denied CORS');
  assert.equal(denied.status, 403);
  assert.equal(deniedBody.error?.code, 'CORS_ORIGIN_DENIED');
  assertRequestId(denied, deniedBody, 'Denied CORS');
  console.info('PASS: API rejects an untrusted Origin');

  const missing = await request(`${api}/api/v1/_streamlab_missing_route_smoke`, {}, fetcher);
  const missingBody = await json(missing, '404');
  assert.equal(missing.status, 404);
  assert.equal(missingBody.success, false);
  assert.equal(missingBody.error?.code, 'NOT_FOUND');
  assertRequestId(missing, missingBody, '404');
  console.info('PASS: API standard 404 response');

  const invalid = await request(
    `${api}/api/v1/health`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    },
    fetcher,
  );
  const invalidBody = await json(invalid, 'Invalid JSON');
  assert.equal(invalid.status, 400);
  assert.equal(invalidBody.error?.code, 'INVALID_JSON');
  console.info('PASS: API invalid JSON response');
}

export async function checkWebHttp({ webBase, fetcher = fetch }) {
  const web = webBase.replace(/\/$/, '');
  for (const route of ['/', '/creator', '/watch/example']) {
    const response = await request(`${web}${route}`, {}, fetcher);
    assert.equal(response.status, 200, `Web route ${route} returned HTTP ${response.status}`);
    const html = await response.text();
    assert.match(html, /id=["']root["']/, `Web route ${route} did not return the SPA shell`);
    console.info(`PASS: Web SPA HTTP ${route}`);
  }

  const viaProxy = await request(`${web}/api/v1/health`, {}, fetcher);
  assert.equal(viaProxy.status, 200, `Vite /api proxy returned HTTP ${viaProxy.status}`);
  const health = await json(viaProxy, 'Web API proxy');
  assert.equal(health.status, 'ok');
  assert.equal(health.service, 'api');
  console.info('PASS: Web /api proxy -> Express API');
}
