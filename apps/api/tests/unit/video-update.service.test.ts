import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { UpdateVideoRequestSchema } from '@streamlab/contracts';
import {
  createUpdateVideoService,
  type VideoMetadataWriter,
} from '../../src/services/video-update.service.js';

const videoId = randomUUID();
const ownerId = randomUUID();
const date = new Date('2026-11-24T07:00:00.000Z');

test('update service passes authenticated owner and returns only public video fields', async () => {
  let receivedOwner = '';
  let receivedId = '';
  let receivedInput: unknown;
  const writer: VideoMetadataWriter = async (id, owner, input) => {
    receivedId = id;
    receivedOwner = owner;
    receivedInput = input;
    return {
      id,
      ownerId: owner,
      title: input.title ?? 'Original',
      description: input.description ?? null,
      status: 'DRAFT',
      visibility: 'PRIVATE',
      durationSeconds: null,
      publishedAt: null,
      createdAt: date,
      updatedAt: date,
    };
  };
  const input = UpdateVideoRequestSchema.parse({
    title: '   Edited title  ',
    description: null,
    categoryIds: [],
  });
  const result = await createUpdateVideoService(writer)(videoId, ownerId, input);
  assert.equal(receivedId, videoId);
  assert.equal(receivedOwner, ownerId);
  assert.deepEqual(receivedInput, { title: 'Edited title', description: null, categoryIds: [] });
  assert.equal(result.title, 'Edited title');
  assert.equal(result.updatedAt, date.toISOString());
  assert.ok(!('deletedAt' in result));
  assert.ok(!('processingVersion' in result));
  assert.ok(!('storageKey' in result));
});

test('shared update contract rejects empty patch, mass assignment, invalid fields and duplicate categories', () => {
  for (const input of [
    {},
    { title: '   ' },
    { title: 'A'.repeat(161) },
    { ownerId },
    { status: 'READY' },
    { deletedAt: null },
    { publishedAt: date.toISOString() },
    { processingVersion: 4 },
    { categoryIds: [videoId, videoId] },
    { visibility: 'INVALID' },
  ])
    assert.equal(UpdateVideoRequestSchema.safeParse(input).success, false, JSON.stringify(input));
  assert.deepEqual(UpdateVideoRequestSchema.parse({ categoryIds: [] }), { categoryIds: [] });
  assert.deepEqual(UpdateVideoRequestSchema.parse({ description: null }), { description: null });
});
