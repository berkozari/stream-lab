import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { readStorageConfig } from '../../src/config/storage-env.js';
import { createStagingObjectKey, createVerifiedOriginalKey } from '../../src/lib/storage-keys.js';
import {
  createUploadStorageService,
  type PutUrlSigner,
} from '../../src/services/storage.service.js';

const videoId = randomUUID();
const uploadId = randomUUID();
const config = readStorageConfig({
  NODE_ENV: 'test',
  S3_ENDPOINT: 'http://127.0.0.1:9000',
  S3_UPLOAD_BUCKET: 'streamlab-uploads',
  S3_MEDIA_BUCKET: 'streamlab-media',
  S3_ROOT_USER: 'dev-access',
  S3_ROOT_PASSWORD: 'dev-secret',
});

test('storage config rejects unsafe endpoint and incomplete credentials', () => {
  assert.throws(() =>
    readStorageConfig({
      ...{ S3_ROOT_USER: 'x', S3_ROOT_PASSWORD: 'y' },
      S3_ENDPOINT: 'http://user:pass@127.0.0.1:9000',
    }),
  );
  assert.throws(() =>
    readStorageConfig({ NODE_ENV: 'production', S3_ENDPOINT: 'http://storage.example.test' }),
  );
  assert.throws(() =>
    readStorageConfig({
      ...{ S3_ROOT_USER: 'x', S3_ROOT_PASSWORD: 'y' },
      S3_ACCESS_KEY_ID: 'only-key',
    }),
  );
  assert.equal(config.forcePathStyle, true);
  assert.deepEqual(config.credentials, {
    accessKeyId: 'dev-access',
    secretAccessKey: 'dev-secret',
  });
});

test('keys are generated from UUIDs only and verified originals are unique', () => {
  assert.equal(createStagingObjectKey(videoId, uploadId), `staging/${videoId}/${uploadId}/source`);
  assert.notEqual(
    createVerifiedOriginalKey(videoId, uploadId),
    createVerifiedOriginalKey(videoId, uploadId),
  );
  assert.throws(() => createStagingObjectKey('../staging', uploadId));
  assert.throws(() => createStagingObjectKey(videoId, `${uploadId}/../../x`));
});

test('presigned PUT is restricted to private staging, signed content-type and 600s', async () => {
  const captured: { command?: PutObjectCommand; settings?: Parameters<PutUrlSigner>[2] } = {};
  const signer: PutUrlSigner = async (_client, cmd, options) => {
    captured.command = cmd;
    captured.settings = options;
    return 'http://127.0.0.1:9000/streamlab-uploads/staging/signed?X-Amz-Signature=fake';
  };
  const service = createUploadStorageService({ config, signer, client: {} as unknown as S3Client });
  const result = await service.signStagingPut({ videoId, uploadId, contentType: 'video/mp4' });
  assert.ok(captured.command instanceof PutObjectCommand);
  assert.equal(captured.command.input.Bucket, config.uploadBucket);
  assert.equal(captured.command.input.Key, createStagingObjectKey(videoId, uploadId));
  assert.equal(captured.command.input.ContentType, 'video/mp4');
  assert.equal(captured.settings?.expiresIn, 600);
  assert.equal(captured.settings?.signableHeaders.has('content-type'), true);
  assert.deepEqual(result.headers, { 'Content-Type': 'video/mp4' });
  assert.equal(result.method, 'PUT');
  await assert.rejects(
    service.signStagingPut({ videoId, uploadId, contentType: 'application/x-test' as 'video/mp4' }),
  );
});

test('optional SHA-256 becomes a required signed storage header', async () => {
  const captured: { command?: PutObjectCommand; settings?: Parameters<PutUrlSigner>[2] } = {};
  const service = createUploadStorageService({
    config,
    client: {} as unknown as S3Client,
    signer: async (_client, cmd, options) => {
      captured.command = cmd;
      captured.settings = options;
      return 'http://localhost:9000/presigned';
    },
  });
  const sha = 'ab'.repeat(32);
  const result = await service.signStagingPut({
    videoId,
    uploadId,
    contentType: 'video/webm',
    checksumSha256: sha,
  });
  assert.equal(captured.command?.input.ChecksumSHA256, Buffer.from(sha, 'hex').toString('base64'));
  assert.equal(captured.settings?.unhoistableHeaders?.has('x-amz-checksum-sha256'), true);
  assert.equal(result.headers['x-amz-checksum-sha256'], Buffer.from(sha, 'hex').toString('base64'));
  await assert.rejects(
    service.signStagingPut({ videoId, uploadId, contentType: 'video/mp4', checksumSha256: 'x' }),
  );
});

test('HEAD and delete are scoped to the staging bucket and server-derived key', async () => {
  const seen: Array<HeadObjectCommand | DeleteObjectCommand> = [];
  const fake = {
    async send(cmd: HeadObjectCommand | DeleteObjectCommand) {
      seen.push(cmd);
      return { ContentLength: 42, ContentType: 'video/mp4', ETag: '"not-a-checksum"' };
    },
  } as unknown as S3Client;
  const service = createUploadStorageService({ config, client: fake });
  const data = await service.headStaging({ videoId, uploadId });
  assert.equal(data.sizeBytes, 42);
  assert.equal(data.etag, '"not-a-checksum"');
  await service.deleteStaging({ videoId, uploadId });
  assert.ok(seen[0] instanceof HeadObjectCommand);
  assert.ok(seen[1] instanceof DeleteObjectCommand);
  for (const command of seen) {
    assert.equal(command.input.Bucket, 'streamlab-uploads');
    assert.equal(command.input.Key, createStagingObjectKey(videoId, uploadId));
  }
});
