import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVideoClient,
  type VideoHttpClient,
} from '../src/features/videos/services/video-client.ts';

const id = '90af8cd8-ef0f-4e15-b967-fbccaa23dc4a';
const ownerId = '90af8cd8-ef0f-4e15-b967-fbccaa23dc4b';
const video = {
  id,
  ownerId,
  title: 'Demo',
  description: null,
  status: 'DRAFT',
  visibility: 'PRIVATE',
  durationSeconds: null,
  publishedAt: null,
  createdAt: '2026-11-24T00:00:00.000Z',
  updatedAt: '2026-11-24T00:00:00.000Z',
};

function mockClient() {
  const calls: Array<{ method: string; url: string; payload?: unknown; signal?: AbortSignal }> = [];
  const http: VideoHttpClient = {
    async get<T>(url: string, config?: { signal?: AbortSignal }) {
      calls.push({ method: 'GET', url, signal: config?.signal });
      const response =
        url.startsWith('/videos?') || url.startsWith('/videos/mine?')
          ? { items: [video], nextCursor: 'next-cursor' }
          : video;
      return { data: { success: true, data: response } as T };
    },
    async post<T>(url: string, payload?: unknown) {
      calls.push({ method: 'POST', url, payload });
      return { data: { success: true, data: video } as T };
    },
    async patch<T>(url: string, payload?: unknown) {
      calls.push({ method: 'PATCH', url, payload });
      return { data: { success: true, data: video } as T };
    },
    async delete<T>(url: string) {
      calls.push({ method: 'DELETE', url });
      return { data: { success: true, data: { status: 'DELETING' } } as T };
    },
  };
  return { service: createVideoClient(http), calls };
}

test('public and private cursor reads use the right endpoints and AbortSignal', async () => {
  const { service, calls } = mockClient();
  const signal = new AbortController().signal;
  const publicPage = await service.listPublic({ q: '  guide  ', limit: 3, cursor: 'c/1' }, signal);
  const minePage = await service.listMine({ limit: 5 });
  assert.equal(publicPage.items[0]?.id, id);
  assert.equal(publicPage.nextCursor, 'next-cursor');
  assert.equal(minePage.items.length, 1);
  assert.equal(calls[0]?.url, '/videos?q=guide&limit=3&cursor=c%2F1');
  assert.equal(calls[0]?.signal, signal);
  assert.equal(calls[1]?.url, '/videos/mine?limit=5');
  assert.equal((await service.detail(id)).id, id);
  assert.equal(calls[2]?.url, `/videos/${id}`);
});

test('create and update reuse Zod payload normalization; delete preserves 202 data', async () => {
  const { service, calls } = mockClient();
  await service.create({ title: '  Demo  ' });
  assert.deepEqual(calls[0]?.payload, { title: 'Demo', categoryIds: [] });
  await service.update(id, { title: '  Renamed  ', categoryIds: [] });
  assert.deepEqual(calls[1]?.payload, { title: 'Renamed', categoryIds: [] });
  assert.equal((await service.remove(id)).status, 'DELETING');
  assert.deepEqual(
    calls.map((call) => call.method),
    ['POST', 'PATCH', 'DELETE'],
  );
});

test('invalid metadata and IDs fail before any network request', async () => {
  const { service, calls } = mockClient();
  await assert.rejects(() => service.create({ title: '   ' }));
  await assert.rejects(() => service.create({ title: 'Example', ownerId }));
  await assert.rejects(() => service.update(id, {}));
  await assert.rejects(() => service.detail('not-a-uuid'));
  await assert.rejects(() => service.remove('not-a-uuid'));
  await assert.rejects(() => service.listPublic({ limit: 90 }));
  assert.equal(calls.length, 0);
});
