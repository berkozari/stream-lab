/** STREAM-008.5: Creator analytics aggregation/dashboard. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response, NextFunction } from 'express';
import { createCreatorAnalyticsController } from '../../src/controllers/creator-analytics.controller.js';

const ownerId = 'e1e926fb-ae15-4a6c-89b8-6af25d33a69c';
const payload = {
  range: '7d' as const,
  asOf: '2026-11-26T12:00:00.000Z',
  rangeStart: '2026-11-19T12:00:00.000Z',
  qualifiedViews: 0,
  watchSeconds: 0,
  completedViews: 0,
  averageWatchSeconds: 0,
  completionRatePercent: 0,
  topVideos: [],
};

function makeResponse() {
  const headers: Record<string, string> = {};
  let body: unknown;
  const response = {
    set: (name: string, value: string) => {
      headers[name] = value;
      return response;
    },
    status: (code: number) => {
      assert.equal(code, 200);
      return response;
    },
    json: (value: unknown) => {
      body = value;
      return response;
    },
  } as unknown as Response;
  return { response, headers, body: () => body };
}

test('creator controller scopes analytics to req.auth.userId, never a query parameter', async () => {
  let queriedOwner = '';
  const handler = createCreatorAnalyticsController(async (userId, range) => {
    queriedOwner = userId;
    assert.equal(range, '7d');
    return payload;
  });
  const { response, headers, body } = makeResponse();
  await handler(
    {
      auth: { userId: ownerId },
      query: { range: '7d', ownerId: 'attacker' },
    } as unknown as Request,
    response,
    (() => undefined) as NextFunction,
  );
  assert.equal(queriedOwner, ownerId);
  assert.equal(headers['Cache-Control'], 'private, no-store');
  assert.deepEqual(body(), { success: true, data: payload });
});

test('invalid ranges are rejected with 422 before querying the database', async () => {
  const handler = createCreatorAnalyticsController(async () => {
    throw new Error('must not reach database');
  });
  const { response } = makeResponse();
  await assert.rejects(
    () =>
      handler(
        { auth: { userId: ownerId }, query: { range: 'yesterday' } } as unknown as Request,
        response,
        (() => undefined) as NextFunction,
      ),
    (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 422,
  );
});

test('anonymous analytics requests are rejected with 401', async () => {
  const handler = createCreatorAnalyticsController(async () => payload);
  const { response } = makeResponse();
  await assert.rejects(
    () =>
      handler(
        { query: { range: 'all' } } as unknown as Request,
        response,
        (() => undefined) as NextFunction,
      ),
    (error: unknown) => error instanceof Error && 'statusCode' in error && error.statusCode === 401,
  );
});
