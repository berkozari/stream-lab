import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createUploadVerificationStorage } from '../../src/services/upload-verify-storage.service.js';
import type { StorageConfig } from '../../src/config/storage-env.js';

const id = randomUUID();
const bytes = Buffer.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
]);
const digest = createHash('sha256').update(bytes).digest('hex');
const config: StorageConfig = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  forcePathStyle: true,
  uploadBucket: 'streamlab-uploads',
  mediaBucket: 'streamlab-media',
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
};
function body() {
  return (async function* () {
    yield bytes;
  })();
}

test('staging GET and conditional copy are followed by verified-copy hash readback', async () => {
  const calls: string[] = [];
  const client = {
    async send(command: unknown): Promise<unknown> {
      if (command instanceof HeadObjectCommand) {
        calls.push('head');
        return { ETag: '"v1"', ContentLength: bytes.length, ContentType: 'video/mp4' };
      }
      if (command instanceof GetObjectCommand) {
        calls.push(command.input.Bucket === config.mediaBucket ? 'read-copy' : 'read-staging');
        if (command.input.Bucket === config.uploadBucket)
          assert.equal(command.input.IfMatch, '"v1"');
        return { Body: body() };
      }
      if (command instanceof CopyObjectCommand) {
        calls.push('copy');
        assert.equal(command.input.CopySourceIfMatch, '"v1"');
        assert.equal(command.input.Bucket, config.mediaBucket);
        assert.ok(command.input.Key?.startsWith(`originals/${id}/${id}/`));
        return {};
      }
      throw new Error('Unexpected S3 operation');
    },
  } as unknown as S3Client;
  const result = await createUploadVerificationStorage({ config, client }).promote({
    videoId: id,
    uploadId: id,
    expectedSizeBytes: BigInt(bytes.length),
    checksumSha256: digest,
  });
  assert.equal(result.sha256Hex, digest);
  assert.equal(result.contentType, 'video/mp4');
  assert.deepEqual(calls, ['head', 'read-staging', 'copy', 'read-copy']);
});

test('source checksum mismatch never copies and rejects verification', async () => {
  const calls: string[] = [];
  const client = {
    async send(command: unknown): Promise<unknown> {
      if (command instanceof HeadObjectCommand)
        return { ETag: '"v2"', ContentLength: bytes.length };
      if (command instanceof GetObjectCommand) return { Body: body() };
      if (command instanceof CopyObjectCommand) calls.push('copy');
      throw new Error('Unexpected operation');
    },
  } as unknown as S3Client;
  await assert.rejects(
    createUploadVerificationStorage({ config, client }).promote({
      videoId: id,
      uploadId: id,
      expectedSizeBytes: BigInt(bytes.length),
      checksumSha256: 'f'.repeat(64),
    }),
    /checksum/i,
  );
  assert.deepEqual(calls, []);
});

test('failed destination verification removes the tentative verified object', async () => {
  let removed = false;
  const client = {
    async send(command: unknown): Promise<unknown> {
      if (command instanceof HeadObjectCommand)
        return { ETag: '"v3"', ContentLength: bytes.length };
      if (command instanceof CopyObjectCommand) return {};
      if (command instanceof GetObjectCommand) {
        return {
          Body:
            command.input.Bucket === config.mediaBucket
              ? (async function* () {
                  yield Buffer.alloc(bytes.length);
                })()
              : body(),
        };
      }
      if (command instanceof DeleteObjectCommand) {
        assert.equal(command.input.Bucket, config.mediaBucket);
        removed = true;
        return {};
      }
      throw new Error('Unexpected operation');
    },
  } as unknown as S3Client;
  await assert.rejects(
    createUploadVerificationStorage({ config, client }).promote({
      videoId: id,
      uploadId: id,
      expectedSizeBytes: BigInt(bytes.length),
      checksumSha256: digest,
    }),
    /signature|checksum/i,
  );
  assert.equal(removed, true);
});
