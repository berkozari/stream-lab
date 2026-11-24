import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createDeleteVideoService } from '../../src/services/video-delete.service.js';

const videoId = randomUUID();
const ownerId = randomUUID();

test('deletion service passes authenticated identity and returns the documented allowlist', async () => {
  const calls: Array<{ id: string; owner: string }> = [];
  const handler = createDeleteVideoService(async (id, owner) => {
    calls.push({ id, owner });
  });
  const result = await handler(videoId, ownerId);
  assert.deepEqual(calls, [{ id: videoId, owner: ownerId }]);
  assert.deepEqual(result, { status: 'DELETING' });
  assert.equal('videoId' in result, false);
});

test('deletion service propagates repository errors instead of reporting acceptance', async () => {
  const error = new Error('Video not found');
  const handler = createDeleteVideoService(async () => {
    throw error;
  });
  await assert.rejects(handler(videoId, ownerId), (actual) => actual === error);
});
