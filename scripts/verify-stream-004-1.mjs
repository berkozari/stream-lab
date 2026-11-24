import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const policy = JSON.parse(read('docs/architecture/stream-004-1-upload-policy.json'));
const adr = read('docs/adr/ADR-009-upload-session-security.md');
const threat = read('docs/security/stream-004-1-upload-threat-model.md');
const guide = read('docs/development/stream-004-1-acceptance.md');
const schema = read('apps/api/prisma/schema.prisma');
const compose = read('compose.yaml');
const config = read('.env.example');
const cors = read('infra/storage/cors/uploads.xml');
const openapi = read('apps/api/docs/openapi/openapi.yaml');
const pkg = JSON.parse(read('package.json'));

assert.equal(policy.milestone, 'STREAM-004.1');
assert.equal(policy.scope, 'architecture-only');
assert.ok(policy.singlePutLimitBytes < policy.maxFileSizeBytes);
assert.ok(policy.multipartPartSizeBytes >= 5 * 1024 * 1024);
assert.ok(policy.presignedUrlTtlSeconds <= 15 * 60);
assert.ok(policy.uploadSessionTtlSeconds > policy.presignedUrlTtlSeconds);
assert.notEqual(policy.stagingKeyTemplate, policy.verifiedKeyTemplate);
assert.equal(policy.storageCredentialsInBrowser, false);
assert.equal(policy.workerReadsOnlyVerifiedKeys, true);
assert.equal(policy.objectVerificationRequiredBeforeProcessing, true);
assert.equal(policy.anonymousBucketsAllowed, false);
for (const marker of [
  'staging',
  'verified',
  'VideoUpload',
  'multipart',
  'ownership',
  'checksum',
  'replay',
]) {
  assert.ok(adr.toLowerCase().includes(marker.toLowerCase()), `ADR missing: ${marker}`);
}
for (const marker of ['BOLA/IDOR', 'Size bypass', 'Race during completion', 'Delete race']) {
  assert.ok(threat.includes(marker), `Threat model missing: ${marker}`);
}
assert.ok(guide.includes('STREAM-004.2'));
for (const model of [
  'model VideoUpload',
  'model MediaAsset',
  'enum UploadStatus',
  'enum UploadMode',
]) {
  assert.ok(schema.includes(model), `Prisma model missing: ${model}`);
}
for (const bucket of ['S3_UPLOAD_BUCKET', 'S3_MEDIA_BUCKET']) {
  assert.ok(config.includes(bucket), `Root env example missing: ${bucket}`);
}
assert.ok(compose.includes('127.0.0.1:${S3_PORT:-9000}:9000'));
assert.ok(cors.includes('<AllowedMethod>PUT</AllowedMethod>'));
assert.ok(cors.includes('http://localhost:5173'));
assert.ok(!cors.includes('<AllowedOrigin>*</AllowedOrigin>'));
assert.ok(openapi.includes('/api/v1/videos/{videoId}/uploads:'));
assert.ok(openapi.includes('/api/v1/uploads/{uploadId}/complete:'));
assert.equal(pkg.scripts['verify:upload:architecture'], 'node scripts/verify-stream-004-1.mjs');
assert.equal(
  pkg.scripts['test:upload:architecture'],
  'node --test tests/architecture/upload-security-policy.test.mjs',
);
assert.ok(pkg.scripts.check.includes('pnpm verify:upload:architecture'));
assert.ok(pkg.scripts.check.includes('pnpm test:upload:architecture'));
console.log(
  'PASS: STREAM-004.1 upload policy, ADR, threat model, Prisma, S3 and planned API compatibility',
);
