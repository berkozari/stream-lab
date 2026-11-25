import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import { downloadVerifiedOriginal } from '../../src/services/storage/original-source.js';
import type { WorkerStorageConfig } from '../../src/config/storage.js';

const source = {
  storageKey:
    'originals/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000/123e4567-e89b-42d3-a456-426614174000/source',
  sizeBytes: 3n,
};
const config: WorkerStorageConfig = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  mediaBucket: 'streamlab-media',
};
function client(data: Uint8Array, declaredLength?: number): S3Client {
  return {
    send: async () => ({ Body: Readable.from([data]), ContentLength: declaredLength }),
  } as unknown as S3Client;
}

test('downloads verified original and exposes a cleanup callback', async () => {
  const local = await downloadVerifiedOriginal(source, {
    config,
    client: client(Buffer.from('abc'), 3),
  });
  try {
    assert.equal((await readFile(local.filePath)).toString(), 'abc');
  } finally {
    await local.cleanup();
  }
  await assert.rejects(readFile(local.filePath), /ENOENT/);
});

test('rejects storage keys outside internal originals namespace', async () => {
  await assert.rejects(
    downloadVerifiedOriginal(
      { ...source, storageKey: '../not-allowed' },
      { config, client: client(Buffer.from('abc')) },
    ),
    /INVALID_ORIGINAL_STORAGE_KEY/,
  );
});

test('rejects changed object lengths and deletes temporary file', async () => {
  await assert.rejects(
    downloadVerifiedOriginal(source, { config, client: client(Buffer.from('ab'), 3) }),
    /ORIGINAL_SIZE_CHANGED/,
  );
  await assert.rejects(
    downloadVerifiedOriginal(source, { config, client: client(Buffer.from('abcd'), 4) }),
    /ORIGINAL_SIZE_CHANGED/,
  );
});
