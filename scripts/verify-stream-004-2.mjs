import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file) => readFileSync(resolve(process.cwd(), file), 'utf8');
const policy = JSON.parse(read('docs/architecture/stream-004-1-upload-policy.json'));
const source = read('packages/contracts/src/api/upload.ts');
const barrel = read('packages/contracts/src/api/index.ts');
const yaml = read('apps/api/docs/openapi/openapi.yaml');
const pkg = JSON.parse(read('package.json'));
const legacyTest = read('packages/contracts/tests/api-contracts.test.mjs');
const documentation = read('docs/api/stream-004-2-upload-contracts.md');

for (const marker of [
  'UPLOAD_LIMITS',
  'UploadSizeBytesSchema',
  'UploadContentTypeSchema',
  'UploadChecksumSha256Schema',
  'CreateUploadRequestSchema',
  'CreateSinglePutUploadRequestSchema',
  'CreateMultipartUploadRequestSchema',
  'CreateUploadResponseSchema',
  'CompleteUploadResponseSchema',
  'SignMultipartPartRequestSchema',
  'CompleteMultipartUploadRequestSchema',
]) {
  assert.ok(source.includes(`export const ${marker}`), `Missing Zod export ${marker}`);
}
assert.ok(
  barrel.includes("export * from './upload.js'"),
  'Shared API barrel must export upload contracts',
);
for (const [marker, value] of [
  ['minFileSizeBytes', policy.minFileSizeBytes],
  ['maxFileSizeBytes', policy.maxFileSizeBytes],
  ['singlePutLimitBytes', policy.singlePutLimitBytes],
  ['multipartPartSizeBytes', policy.multipartPartSizeBytes],
  ['presignedUrlTtlSeconds', policy.presignedUrlTtlSeconds],
]) {
  assert.match(
    source,
    new RegExp(`${marker}:\\s*${value.toLocaleString('en-US').replaceAll(',', '[_,]?')}`, 'u'),
  );
}
const section = (name) => {
  const start = yaml.search(new RegExp(`^    ${name}:\\s*$`, 'mu'));
  assert.ok(start >= 0, `OpenAPI component missing: ${name}`);
  const from = yaml.slice(start);
  const next = from.slice(1).search(/^ {4}[A-Za-z][A-Za-z0-9]*:[ \t]*$/mu);
  return next < 0 ? from : from.slice(0, next + 1);
};
const create = section('CreateUploadRequest');
assert.match(create, /^ {6}additionalProperties: false$/mu);
assert.match(create, /video\/mp4/u);
assert.match(create, /video\/webm/u);
assert.match(create, /2147483648/u);
for (const name of [
  'UploadSession',
  'UploadComplete',
  'CreateMultipartUploadRequest',
  'SignMultipartPartRequest',
  'SignMultipartPartResponse',
  'CompleteMultipartUploadRequest',
  'CreateMultipartUploadResponse',
]) {
  assert.ok(section(name).length > 40);
}
for (const path of ['/api/v1/videos/{videoId}/uploads', '/api/v1/uploads/{uploadId}/complete']) {
  const start = yaml.indexOf(`  ${path}:`);
  assert.ok(start >= 0, `Missing path ${path}`);
  const end = yaml.indexOf('\n  /api/v1/', start + path.length);
  const operation = yaml.slice(start, end < 0 ? undefined : end);
  const expectedStatus =
    path.includes('{videoId}/uploads') || path.includes('{uploadId}/complete')
      ? 'implemented'
      : 'planned';
  assert.ok(
    operation.includes(`x-streamlab-status: ${expectedStatus}`),
    `Upload API status drift: ${path}`,
  );
}
assert.ok(
  legacyTest.includes('2147483648'),
  'Legacy contract test must use a permitted upload size',
);
assert.ok(documentation.includes('STREAM-004.7'));
assert.equal(pkg.scripts['verify:upload:contracts'], 'node scripts/verify-stream-004-2.mjs');
assert.equal(
  pkg.scripts['test:upload:contracts'],
  'pnpm --filter @streamlab/contracts build && node --test packages/contracts/tests/upload-contracts.test.mjs',
);
assert.ok(pkg.scripts.check.includes('pnpm verify:upload:contracts'));
assert.ok(pkg.scripts.check.includes('pnpm test:upload:contracts'));
console.log(
  'PASS: STREAM-004.2 upload Zod contracts, OpenAPI, existing DTO compatibility and planned endpoint status',
);
