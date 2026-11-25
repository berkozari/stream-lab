import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompleteMultipartUploadRequestSchema,
  CompleteUploadResponseSchema,
  CreateMultipartUploadRequestSchema,
  CreateMultipartUploadResponseSchema,
  CreateSinglePutUploadRequestSchema,
  CreateUploadRequestSchema,
  CreateUploadResponseSchema,
  SignMultipartPartRequestSchema,
  SizeBytesSchema,
  UPLOAD_LIMITS,
  UploadSizeBytesSchema,
} from '../dist/index.js';
import { readFileSync } from 'node:fs';

const policy = JSON.parse(
  readFileSync(
    new URL('../../../docs/architecture/stream-004-1-upload-policy.json', import.meta.url),
  ),
);
const uuid = '123e4567-e89b-42d3-a456-426614174000';
const expiresAt = '2026-11-24T10:00:00.000Z';
const request = (sizeBytes = '1', overrides = {}) => ({
  fileName: 'my-video.mp4',
  contentType: 'video/mp4',
  sizeBytes,
  ...overrides,
});

test('runtime upload constants agree with the accepted STREAM-004.1 policy', () => {
  for (const key of [
    'minFileSizeBytes',
    'maxFileSizeBytes',
    'singlePutLimitBytes',
    'multipartPartSizeBytes',
    'maxOriginalFileNameLength',
    'presignedUrlTtlSeconds',
    'uploadSessionTtlSeconds',
  ]) {
    assert.equal(UPLOAD_LIMITS[key], policy[key], `Policy drift: ${key}`);
  }
});

test('upload byte sizes are safe JSON decimal strings bounded to 2 GiB', () => {
  assert.equal(SizeBytesSchema.safeParse('1099511627776').success, true);
  for (const value of ['1', '104857600', '104857601', '2147483648']) {
    assert.equal(UploadSizeBytesSchema.safeParse(value).success, true, value);
  }
  for (const value of ['0', '-1', '01', '1.5', '2147483649', '1099511627776', 42]) {
    assert.equal(UploadSizeBytesSchema.safeParse(value).success, false, String(value));
  }
});

test('file names, MIME/extension pairs and checksum cannot bypass the allowlist', () => {
  assert.equal(
    CreateUploadRequestSchema.safeParse(
      request('1', { fileName: 'clip.WEBM', contentType: 'video/webm' }),
    ).success,
    true,
  );
  assert.equal(
    CreateUploadRequestSchema.parse(request('100', { fileName: ' clip.mp4 ' })).fileName,
    'clip.mp4',
  );
  for (const payload of [
    request('100', { fileName: '../secret.mp4' }),
    request('100', { fileName: 'some\\path.mp4' }),
    request('100', { fileName: 'bad\nname.mp4' }),
    request('100', { fileName: 'film.webm' }),
    request('100', { contentType: 'video/quicktime' }),
    request('100', { fileName: '.mp4' }),
    request('100', { fileName: 'x'.repeat(252) + '.mp4' }),
    request('100', { checksumSha256: 'not-a-sha256' }),
    request('100', { ownerId: uuid }),
    request('100', { storageKey: 'staging/unsafe' }),
    request('100', { status: 'VERIFIED' }),
  ]) {
    assert.equal(
      CreateUploadRequestSchema.safeParse(payload).success,
      false,
      JSON.stringify(payload),
    );
  }
  assert.equal(
    CreateUploadRequestSchema.safeParse(request('100', { checksumSha256: 'a'.repeat(64) })).success,
    true,
  );
  assert.equal(
    CreateUploadRequestSchema.safeParse(request('100', { checksumSha256: 'A'.repeat(64) })).success,
    false,
  );
});

test('single PUT boundary is 100 MiB; multipart is above 100 MiB, at most 2 GiB', () => {
  assert.equal(CreateSinglePutUploadRequestSchema.safeParse(request('104857600')).success, true);
  assert.equal(CreateSinglePutUploadRequestSchema.safeParse(request('104857601')).success, false);
  assert.equal(CreateMultipartUploadRequestSchema.safeParse(request('104857600')).success, false);
  assert.equal(CreateMultipartUploadRequestSchema.safeParse(request('104857601')).success, true);
  assert.equal(CreateMultipartUploadRequestSchema.safeParse(request('2147483648')).success, true);
  assert.equal(CreateMultipartUploadRequestSchema.safeParse(request('2147483649')).success, false);
});

test('single-PUT and complete response schemas retain existing API shape', () => {
  assert.equal(
    CreateUploadResponseSchema.safeParse({
      uploadId: uuid,
      videoId: uuid,
      mode: 'SINGLE',
      method: 'PUT',
      uploadUrl: 'http://127.0.0.1:9000/streamlab-uploads/key?signature=test',
      headers: { 'Content-Type': 'video/mp4' },
      expiresAt,
    }).success,
    true,
  );
  assert.equal(
    CompleteUploadResponseSchema.safeParse({ videoId: uuid, uploadId: uuid, status: 'UPLOADED' })
      .success,
    true,
  );
  assert.equal(
    CompleteUploadResponseSchema.safeParse({ videoId: uuid, uploadId: uuid, status: 'QUEUED' })
      .success,
    true,
  );
});

test('multipart plans enforce part numbers, ascending receipts and strict DTOs', () => {
  assert.equal(SignMultipartPartRequestSchema.safeParse({ partNumber: 1 }).success, true);
  assert.equal(SignMultipartPartRequestSchema.safeParse({ partNumber: 0 }).success, false);
  assert.equal(SignMultipartPartRequestSchema.safeParse({ partNumber: 10_001 }).success, false);
  assert.equal(
    SignMultipartPartRequestSchema.safeParse({ partNumber: 2, storageKey: 'unsafe' }).success,
    false,
  );
  const parts = [
    { partNumber: 1, etag: '"etag-1"' },
    { partNumber: 2, etag: '"etag-2"' },
  ];
  assert.equal(CompleteMultipartUploadRequestSchema.safeParse({ parts }).success, true);
  for (const badParts of [
    [],
    [parts[1], parts[0]],
    [parts[0], parts[0]],
    [{ partNumber: 2, etag: 'etag-2' }],
    [{ partNumber: 1, etag: 'x\r\nInjected' }],
  ]) {
    assert.equal(
      CompleteMultipartUploadRequestSchema.safeParse({ parts: badParts }).success,
      false,
    );
  }
  assert.equal(
    CompleteMultipartUploadRequestSchema.safeParse({ parts, uploadId: uuid }).success,
    false,
  );
  assert.equal(
    CreateMultipartUploadResponseSchema.safeParse({
      uploadId: uuid,
      videoId: uuid,
      mode: 'MULTIPART',
      partSizeBytes: 8_388_608,
      expiresAt,
    }).success,
    true,
  );
});

test('invalid upload sizes return validation errors without throwing', () => {
  const invalidSizes = ['1.5', 'abc', '01', '-1', '2147483649'];

  const schemas = [
    CreateUploadRequestSchema,
    CreateSinglePutUploadRequestSchema,
    CreateMultipartUploadRequestSchema,
  ];

  for (const sizeBytes of invalidSizes) {
    for (const schema of schemas) {
      const result = schema.safeParse(request(sizeBytes));

      assert.equal(result.success, false, `Expected validation failure for ${sizeBytes}`);
    }
  }
});
