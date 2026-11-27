import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectsCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { uploadHlsOutput } from '../../src/services/storage/hls-objects.js';

const job = {
  contractVersion: 1 as const,
  videoId: '123e4567-e89b-42d3-a456-426614174000',
  processingVersion: 1,
};
const token = '00000000-0000-4000-8000-000000000001';
const config = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  mediaBucket: 'streamlab-media',
  forcePathStyle: true,
};

test('publishes master last; uses version/token isolated keys; cleanup is bounded', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'streamlab-s3-test-'));
  try {
    const names = ['240p/segment_00000.ts', '240p/index.m3u8', 'master.m3u8'];
    const files = [];
    for (const name of names) {
      const path = join(dir, String(files.length));
      await writeFile(path, 'bytes');
      files.push({
        relativePath: name,
        absolutePath: path,
        sizeBytes: 5n,
        contentType: name.endsWith('.ts') ? 'video/mp2t' : 'application/vnd.apple.mpegurl',
      });
    }
    const received: string[] = [];
    const client = {
      send: async (command: unknown) => {
        if (command instanceof PutObjectCommand) received.push(command.input.Key!);
        if (command instanceof DeleteObjectsCommand) received.push('deleted');
        return {};
      },
    } as unknown as S3Client;
    const uploaded = await uploadHlsOutput(job, token, files, new AbortController().signal, {
      config,
      client,
    });
    assert.equal(received.length, 3);
    assert.ok(received[2]?.endsWith('/master.m3u8'));
    assert.ok(received.every((key) => key.startsWith(`hls/${job.videoId}/v1/${token}/`)));
    await uploaded.cleanup();
    assert.equal(received[3], 'deleted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('invalid remote name is rejected before uploading', async () => {
  await assert.rejects(
    uploadHlsOutput(
      job,
      token,
      [
        {
          relativePath: '../escape.ts',
          absolutePath: '/tmp/x',
          sizeBytes: 1n,
          contentType: 'video/mp2t',
        },
      ],
      new AbortController().signal,
      { config },
    ),
    /HLS_UPLOAD_MANIFEST_INVALID/u,
  );
});

test('upload failure cleans all attempt-scoped keys, including an uncertain PUT', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'streamlab-s3-fail-'));
  try {
    const names = ['240p/segment_00000.ts', '240p/index.m3u8', 'master.m3u8'];
    const files = [];
    for (const name of names) {
      const path = join(dir, String(files.length));
      await writeFile(path, 'bytes');
      files.push({
        relativePath: name,
        absolutePath: path,
        sizeBytes: 5n,
        contentType: 'video/mp2t',
      });
    }
    let puts = 0;
    const deleted: string[] = [];
    const client = {
      send: async (command: unknown) => {
        if (command instanceof PutObjectCommand && ++puts === 2)
          throw new Error('connection reset after PUT');
        if (command instanceof DeleteObjectsCommand)
          deleted.push(...(command.input.Delete?.Objects ?? []).map((x) => x.Key!));
        return {};
      },
    } as unknown as S3Client;
    await assert.rejects(
      uploadHlsOutput(job, token, files, new AbortController().signal, { config, client }),
      /connection reset/u,
    );
    assert.equal(puts, 2);
    assert.equal(deleted.length, 2);
    assert.ok(deleted.every((key) => key.startsWith(`hls/${job.videoId}/v1/${token}/`)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('excessive segment manifests are refused before any object storage writes', async () => {
  const files = Array.from({ length: 20_001 }, (_, index) => ({
    relativePath: `240p/segment_${String(index).padStart(5, '0')}.ts`,
    absolutePath: '/unused',
    sizeBytes: 1n,
    contentType: 'video/mp2t',
  }));
  files[0]!.relativePath = 'master.m3u8';
  let calls = 0;
  const client = {
    send: async () => {
      calls++;
      return {};
    },
  } as unknown as S3Client;
  await assert.rejects(
    uploadHlsOutput(job, token, files, new AbortController().signal, { client, config }),
    /HLS_UPLOAD_MANIFEST_INVALID/u,
  );
  assert.equal(calls, 0);
});
