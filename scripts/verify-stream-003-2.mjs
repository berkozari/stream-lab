import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const video = read('packages/contracts/src/api/video.ts');
const openapi = read('apps/api/docs/openapi/openapi.yaml');

const getComponent = (name) => {
  const start = openapi.search(new RegExp(`^    ${name}:\\s*$`, 'mu'));
  assert.ok(start >= 0, `OpenAPI component ${name} not found`);
  const rest = openapi.slice(start);
  const boundary = rest.slice(1).search(/^ {4}[a-zA-Z][a-zA-Z0-9]+:\s*$/mu);
  return boundary === -1 ? rest : rest.slice(0, boundary + 1);
};

assert.match(video, /export const CreateVideoRequestSchema = z\.strictObject/u);
assert.match(video, /export const UpdateVideoRequestSchema = z\s*\.strictObject/u);
assert.match(video, /categoryIds: UniqueCategoryIdsSchema\.default\(\[\]\)/u);
assert.match(video, /categoryIds: UniqueCategoryIdsSchema\.optional\(\)/u);
assert.match(video, /export const VideoListQuerySchema = PageQuerySchema\.extend/u);
assert.match(video, /\.strict\(\)/u);
for (const name of ['CreateVideoRequest', 'UpdateVideoRequest']) {
  const block = getComponent(name);
  assert.match(block, /^ {6}additionalProperties: false\s*$/mu, `${name}: reject unknown fields`);
  assert.match(block, /^ {10}maxItems: 10\s*$/mu, `${name}: category limit`);
  assert.match(block, /^ {10}uniqueItems: true\s*$/mu, `${name}: category IDs must be unique`);
}
assert.match(getComponent('UpdateVideoRequest'), /^ {6}minProperties: 1\s*$/mu);
console.log(
  'PASS: video Zod schemas, strict metadata fields, OpenAPI limits and compatibility verified',
);
