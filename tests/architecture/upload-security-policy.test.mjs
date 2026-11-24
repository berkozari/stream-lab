import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';

const policy = JSON.parse(
  readFileSync(resolve('docs/architecture/stream-004-1-upload-policy.json'), 'utf8'),
);

test('single PUT limit is smaller than the overall multipart-capable limit', () => {
  assert.equal(policy.singlePutLimitBytes, 100 * 1024 * 1024);
  assert.equal(policy.maxFileSizeBytes, 2 * 1024 * 1024 * 1024);
  assert.ok(policy.minFileSizeBytes > 0);
  assert.ok(policy.maxOriginalFileNameLength <= 255);
});

test('presigned capability is short-lived, with a distinct upload-session expiry', () => {
  assert.equal(policy.presignedUrlTtlSeconds, 600);
  assert.equal(policy.uploadSessionTtlSeconds, 86400);
  assert.ok(policy.presignedUrlTtlSeconds < policy.uploadSessionTtlSeconds);
  assert.equal(policy.uploadUrlsAreBearerCapabilities, true);
});

test('signing cannot expose an accepted original through a mutable staging key', () => {
  assert.ok(policy.stagingKeyTemplate.startsWith('staging/'));
  assert.ok(policy.verifiedKeyTemplate.startsWith('originals/'));
  assert.notEqual(policy.stagingKeyTemplate, policy.verifiedKeyTemplate);
  for (const key of [policy.stagingKeyTemplate, policy.verifiedKeyTemplate]) {
    assert.ok(key.includes('<videoId>'));
    assert.ok(key.includes('<uploadId>'));
  }
  assert.equal(policy.workerReadsOnlyVerifiedKeys, true);
  assert.equal(policy.objectVerificationRequiredBeforeProcessing, true);
});

test('multipart policy permits S3-compatible part boundaries', () => {
  assert.equal(policy.multipartPartSizeBytes, 8 * 1024 * 1024);
  assert.ok(policy.multipartPartSizeBytes >= 5 * 1024 * 1024);
  assert.ok(Math.ceil(policy.maxFileSizeBytes / policy.multipartPartSizeBytes) <= 10_000);
});

test('allowlist and browser credential boundaries are explicitly restricted', () => {
  assert.deepEqual(Object.keys(policy.allowedMediaTypes).sort(), ['video/mp4', 'video/webm']);
  assert.equal(policy.clientControlsStorageKeys, false);
  assert.equal(policy.storageCredentialsInBrowser, false);
  assert.equal(policy.anonymousBucketsAllowed, false);
  assert.equal(policy.multipartCompletionRequiresServerVerification, true);
  assert.equal(policy.maxActiveUploadSessionsPerVideo, 1);
});
