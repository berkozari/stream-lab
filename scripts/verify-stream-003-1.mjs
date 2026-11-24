import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const schema = readFileSync('apps/api/prisma/schema.prisma', 'utf8');

function getBlock(type, name) {
  const pattern = new RegExp(`^${type} ${name} \\{([\\s\\S]*?)^\\}`, 'mu');
  const match = schema.match(pattern);
  assert.ok(match, `Missing Prisma ${type} ${name}`);
  return match[1];
}

function requireField(block, pattern, label) {
  assert.match(block, pattern, label);
}

const video = getBlock('model', 'Video');
const user = getBlock('model', 'User');
const videoStatus = getBlock('enum', 'VideoStatus');
const visibility = getBlock('enum', 'VideoVisibility');

for (const status of [
  'DRAFT',
  'UPLOADING',
  'UPLOADED',
  'QUEUED',
  'PROCESSING',
  'READY',
  'FAILED',
  'DELETING',
]) {
  requireField(
    videoStatus,
    new RegExp(`^\\s*${status}\\s*$`, 'mu'),
    `VideoStatus.${status} missing`,
  );
}
for (const value of ['PRIVATE', 'UNLISTED', 'PUBLIC']) {
  requireField(
    visibility,
    new RegExp(`^\\s*${value}\\s*$`, 'mu'),
    `VideoVisibility.${value} missing`,
  );
}

const fields = [
  [/^\s*id\s+String\s+@id\s+@default\(uuid\(\)\)\s+@db\.Uuid/mu, 'Video.id UUID primary key'],
  [/^\s*ownerId\s+String\s+@db\.Uuid/mu, 'Video.ownerId UUID'],
  [/^\s*title\s+String\s+@db\.VarChar\(160\)/mu, 'Video.title length'],
  [/^\s*description\s+String\?\s+@db\.Text/mu, 'Video.description optional'],
  [/^\s*status\s+VideoStatus\s+@default\(DRAFT\)/mu, 'Video default status'],
  [/^\s*visibility\s+VideoVisibility\s+@default\(PRIVATE\)/mu, 'Video default visibility'],
  [/^\s*processingVersion\s+Int\s+@default\(0\)/mu, 'Video.processingVersion'],
  [/^\s*durationSeconds\s+Int\?/mu, 'Video.durationSeconds'],
  [/^\s*publishedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/mu, 'Video.publishedAt'],
  [/^\s*deletedAt\s+DateTime\?\s+@db\.Timestamptz\(3\)/mu, 'Video.deletedAt'],
  [/^\s*createdAt\s+DateTime\s+@default\(now\(\)\)/mu, 'Video.createdAt'],
  [/^\s*updatedAt\s+DateTime\s+@updatedAt/mu, 'Video.updatedAt'],
  [
    /^\s*owner\s+User\s+@relation\(fields:\s*\[ownerId\],\s*references:\s*\[id\],\s*onDelete:\s*Restrict\)/mu,
    'Video owner relation',
  ],
  [/@@index\(\[ownerId,\s*createdAt\]\)/u, 'Video owner listing index'],
  [/@@index\(\[status,\s*visibility,\s*deletedAt,\s*publishedAt\]\)/u, 'Video discovery index'],
];
for (const [pattern, label] of fields) requireField(video, pattern, label);
requireField(user, /^\s*videos\s+Video\[\]/mu, 'User.videos relation');

for (const name of [
  'VideoUpload',
  'MediaAsset',
  'VideoRendition',
  'Category',
  'VideoCategory',
  'WatchProgress',
]) {
  getBlock('model', name);
}

console.log(
  'PASS: STREAM-003.1 video schema, ownership, defaults, soft delete, publishing and relations verified',
);
