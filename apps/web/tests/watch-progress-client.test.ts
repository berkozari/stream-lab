import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWatchProgressClient } from '../src/features/watch-history/services/watch-progress-client.ts';

const id = '86e1790b-dc1d-4ff5-9163-c01a9775a128';
const date = '2026-11-26T10:00:00.000Z';
const record = { videoId: id, positionSeconds: 25, completedAt: null, lastWatchedAt: date };

test('reads an absent viewer progress as null', async () => {
  const client = createWatchProgressClient({
    get: async () => ({ data: { success: true, data: null } }),
    put: async () => {
      throw new Error('unexpected');
    },
  });
  assert.equal(await client.read(id), null);
});

test('sends only validated progress, never userId', async () => {
  let path = '';
  let body: unknown;
  const client = createWatchProgressClient({
    get: async () => {
      throw new Error('unexpected');
    },
    put: async (p, b) => {
      path = p;
      body = b;
      return { data: { success: true as const, data: record } };
    },
  });
  assert.deepEqual(await client.save(id, { positionSeconds: 25, completed: false }), record);
  assert.equal(path, `/users/me/watch-progress/${id}`);
  assert.deepEqual(body, { positionSeconds: 25, completed: false });
});

test('continue and history use distinct authenticated endpoints and cursors', async () => {
  const paths: string[] = [];
  const client = createWatchProgressClient({
    get: async (path) => {
      paths.push(path);
      return { data: { success: true as const, data: { items: [], nextCursor: null } } };
    },
    put: async () => {
      throw new Error('unexpected');
    },
  });
  await client.list('continue', 'opaque_cursor');
  await client.list('history', null);
  assert.deepEqual(paths, [
    '/users/me/continue-watching?limit=20&cursor=opaque_cursor',
    '/users/me/watch-history?limit=20',
  ]);
});
