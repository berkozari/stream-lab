import test from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { createCreatorVideoAnalyticsController } from '../../src/controllers/creator-video-analytics.controller.js';

const ownerId = '0dd80c58-1598-4d0a-a92c-8cf2011d89f1';
const videoId = '1b79dc79-5101-4a4d-ab26-c9d7562fd61e';
const details = {
  videoId,
  title: 'Example',
  range: '7d' as const,
  asOf: '2026-11-26T12:00:00.000Z',
  rangeStart: '2026-11-19T12:00:00.000Z',
  qualifiedViews: 0,
  watchSeconds: 0,
  completedViews: 0,
  averageWatchSeconds: 0,
  completionRatePercent: 0,
  daily: [],
};

function stubResponse() {
  const headers: Record<string, string> = {};
  let responseBody: unknown;
  const res = {
    set: (name: string, value: string) => {
      headers[name] = value;
      return res;
    },
    status: (code: number) => {
      assert.equal(code, 200);
      return res;
    },
    json: (body: unknown) => {
      responseBody = body;
      return res;
    },
  } as unknown as Response;
  return { res, headers, body: () => responseBody };
}

test('controller uses the authenticated owner, not query-supplied identity', async () => {
  const handler = createCreatorVideoAnalyticsController(async (owner, id, range) => {
    assert.equal(owner, ownerId);
    assert.equal(id, videoId);
    assert.equal(range, '7d');
    return { ...details, watchSeconds: 0 };
  });
  const result = stubResponse();
  await handler(
    {
      auth: { userId: ownerId },
      params: { videoId },
      query: { range: '7d', ownerId: 'other' },
    } as unknown as Request,
    result.res,
    () => undefined,
  );
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.equal((result.body() as { success: boolean }).success, true);
});

test('controller rejects anonymous requests and malformed paths before reader runs', async () => {
  const handler = createCreatorVideoAnalyticsController(async () => {
    throw new Error('handler must not run');
  });
  const result = stubResponse();
  await assert.rejects(
    () =>
      handler(
        { params: { videoId }, query: {} } as unknown as Request,
        result.res,
        () => undefined,
      ),
    (e: unknown) => e instanceof Error && 'statusCode' in e && e.statusCode === 401,
  );
  await assert.rejects(
    () =>
      handler(
        {
          auth: { userId: ownerId },
          params: { videoId: 'invalid' },
          query: {},
        } as unknown as Request,
        result.res,
        () => undefined,
      ),
    (e: unknown) => e instanceof Error && 'statusCode' in e && e.statusCode === 422,
  );
});
