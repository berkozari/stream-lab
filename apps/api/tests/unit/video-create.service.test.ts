import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { CreateVideoRequestSchema } from '@streamlab/contracts';
import { createVideoService, type VideoDraftWriter } from '../../src/services/video.service.js';

const ownerId = randomUUID();
const videoId = randomUUID();
const now = new Date('2026-11-24T07:00:00.000Z');

test('video service passes authenticated owner to repository and returns public DTO only', async () => {
  let writtenOwner: string | undefined;
  let writtenTitle: string | undefined;
  const write: VideoDraftWriter = async (owner, input) => {
    writtenOwner = owner;
    writtenTitle = input.title;
    return {
      id: videoId,
      ownerId: owner,
      title: input.title,
      description: input.description ?? null,
      status: 'DRAFT',
      visibility: 'PRIVATE',
      durationSeconds: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
    };
  };
  const input = CreateVideoRequestSchema.parse({ title: '  Test video  ' });
  const response = await createVideoService(write)(ownerId, input);
  assert.equal(writtenOwner, ownerId);
  assert.equal(writtenTitle, 'Test video');
  assert.deepEqual(input.categoryIds, []);
  assert.equal(response.title, 'Test video');
  assert.equal(response.status, 'DRAFT');
  assert.equal(response.visibility, 'PRIVATE');
  assert.equal(response.createdAt, now.toISOString());
  assert.equal(response.publishedAt, null);
  assert.ok(!('processingVersion' in response));
  assert.ok(!('deletedAt' in response));
});

test('shared create contract rejects mass-assignment fields and duplicate category IDs', () => {
  const categoryId = randomUUID();
  for (const extra of [
    { ownerId },
    { status: 'READY' },
    { publishedAt: now.toISOString() },
    { deletedAt: null },
  ]) {
    assert.equal(CreateVideoRequestSchema.safeParse({ title: 'Test', ...extra }).success, false);
  }
  assert.equal(
    CreateVideoRequestSchema.safeParse({ title: 'Test', categoryIds: [categoryId, categoryId] })
      .success,
    false,
  );
});
