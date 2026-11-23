import test from 'node:test';
import assert from 'node:assert/strict';
import { checkApiHttp, checkWebHttp } from '../integration/http-checks.mjs';

function response(body, status = 200, headers = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function fakeFetch(url, options = {}) {
  const path = new URL(url).pathname;
  const headers = options.headers ?? {};
  if (url.startsWith('http://web.local')) {
    if (path === '/api/v1/health')
      return Promise.resolve(response({ status: 'ok', service: 'api' }));
    return Promise.resolve(
      response('<html><div id="root"></div></html>', 200, {
        'content-type': 'text/html',
      }),
    );
  }
  if (path === '/api/v1/health' && headers.Origin === 'https://untrusted.example.invalid') {
    return Promise.resolve(
      response({ error: { code: 'CORS_ORIGIN_DENIED' }, requestId: 'id-1' }, 403, {
        'x-request-id': 'id-1',
      }),
    );
  }
  if (path === '/api/v1/health' && options.method === 'POST') {
    return Promise.resolve(response({ error: { code: 'INVALID_JSON' } }, 400));
  }
  if (path === '/api/v1/health/ready') {
    return Promise.resolve(
      response({
        status: 'ready',
        checks: { database: 'up', redis: 'up' },
      }),
    );
  }
  if (path === '/api/v1/_streamlab_missing_route_smoke') {
    return Promise.resolve(
      response({ success: false, error: { code: 'NOT_FOUND' }, requestId: 'id-2' }, 404, {
        'x-request-id': 'id-2',
      }),
    );
  }
  if (path === '/api/v1/health') {
    return Promise.resolve(
      response(
        {
          status: 'ok',
          service: 'api',
          timestamp: new Date().toISOString(),
        },
        200,
        {
          'x-request-id': 'id-3',
          'access-control-allow-origin': 'http://web.local',
        },
      ),
    );
  }
  return Promise.reject(new Error(`Unexpected fake URL: ${url}`));
}

test('HTTP smoke checks accept a healthy API with matching security responses', async () => {
  await checkApiHttp({
    apiBase: 'http://api.local',
    webBase: 'http://web.local',
    fetcher: fakeFetch,
  });
});

test('HTTP smoke checks accept Vite SPA and /api proxy', async () => {
  await checkWebHttp({ webBase: 'http://web.local', fetcher: fakeFetch });
});

test('HTTP smoke checks reject an unhealthy API', async () => {
  const unhealthyFetch = (url, options) => {
    if (new URL(url).pathname === '/api/v1/health/ready') {
      return Promise.resolve(
        response({ status: 'not_ready', checks: { database: 'down', redis: 'up' } }, 503),
      );
    }
    return fakeFetch(url, options);
  };
  await assert.rejects(
    () =>
      checkApiHttp({
        apiBase: 'http://api.local',
        webBase: 'http://web.local',
        fetcher: unhealthyFetch,
      }),
    /readiness/i,
  );
});

test('HTTP smoke checks reject a missing SPA root node', async () => {
  const brokenFetch = (url, options) => {
    if (url === 'http://web.local/') return Promise.resolve(response('<html>broken</html>'));
    return fakeFetch(url, options);
  };
  await assert.rejects(
    () =>
      checkWebHttp({
        webBase: 'http://web.local',
        fetcher: brokenFetch,
      }),
    /SPA shell/,
  );
});
