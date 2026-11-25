import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import {
  cleanupOrphanedHlsObjects,
  isUnreferencedHlsAttempt,
  parseHlsAttemptKey,
} from '../../src/services/storage/hls-orphan-cleanup.js';

const videoId = '123e4567-e89b-42d3-a456-426614174000';
const token = '00000000-0000-4000-8000-000000000001';
const prefix = `hls/${videoId}/v1/${token}/`;
const config = {
  endpoint: 'http://127.0.0.1:9000',
  region: 'us-east-1',
  mediaBucket: 'streamlab-media',
  forcePathStyle: true,
};
const now = new Date('2026-11-25T10:00:00.000Z');
const old = new Date(now.getTime() - 72 * 60 * 60 * 1000);
const young = new Date(now.getTime() - 1 * 60 * 60 * 1000);
const keys = [`${prefix}240p/segment_00000.ts`, `${prefix}240p/index.m3u8`, `${prefix}master.m3u8`];

type ObjectItem = { Key: string; LastModified: Date };
function fixture(
  objects: ObjectItem[] = keys.map((Key) => ({ Key, LastModified: old })),
  opts: { deleteError?: boolean } = {},
) {
  const deleted: string[] = [];
  const commands: unknown[] = [];
  const client = {
    send: async (command: unknown) => {
      commands.push(command);
      if (command instanceof ListObjectsV2Command) {
        const request = command.input;
        const matches = objects.filter(
          (item) =>
            item.Key.startsWith(request.Prefix ?? '') &&
            (!request.StartAfter || item.Key > request.StartAfter),
        );
        // Simulate one-key pages if explicitly requested through ContinuationToken.
        const offset = request.ContinuationToken ? Number(request.ContinuationToken) : 0;
        const batch = matches.slice(offset, offset + (request.MaxKeys ?? 1000));
        const next = offset + batch.length;
        return {
          Contents: batch,
          IsTruncated: next < matches.length,
          ...(next < matches.length ? { NextContinuationToken: String(next) } : {}),
        };
      }
      if (command instanceof DeleteObjectsCommand) {
        deleted.push(...(command.input.Delete?.Objects ?? []).map((obj) => obj.Key!));
        return opts.deleteError ? { Errors: [{ Code: 'AccessDenied', Key: deleted[0] }] } : {};
      }
      throw new Error('Unexpected S3 command');
    },
    destroy: () => {},
  } as unknown as S3Client;
  return { client, deleted, commands };
}

const base = { now, config, minAgeMs: 48 * 60 * 60 * 1000, isUnreferenced: async () => true };

test('only recognizes tightly scoped version/token HLS keys', () => {
  assert.deepEqual(parseHlsAttemptKey(keys[0]!)?.prefix, prefix);
  assert.equal(parseHlsAttemptKey(`hls/${videoId}/v0/${token}/master.m3u8`), null);
  assert.equal(parseHlsAttemptKey('hls/not-a-video/v1/x/master.m3u8'), null);
  assert.equal(parseHlsAttemptKey(`hls/${videoId}/v1/${token}/`), null);
});

test('dry run reports eligible attempts and never issues DeleteObjects', async () => {
  const { client, deleted } = fixture();
  const result = await cleanupOrphanedHlsObjects({ ...base, client });
  assert.equal(result.mode, 'dry-run');
  assert.equal(result.candidates, 1);
  assert.equal(result.eligible, 1);
  assert.equal(result.deletedObjects, 0);
  assert.deepEqual(deleted, []);
});

test('execute checks DB ownership twice then deletes only exact attempt keys', async () => {
  const { client, deleted } = fixture();
  let safetyChecks = 0;
  const result = await cleanupOrphanedHlsObjects({
    ...base,
    client,
    execute: true,
    isUnreferenced: async (attempt) => {
      assert.equal(attempt.videoId, videoId);
      assert.equal(attempt.processingVersion, 1);
      safetyChecks++;
      return true;
    },
  });
  assert.equal(safetyChecks, 2);
  assert.deepEqual(deleted.sort(), [...keys].sort());
  assert.equal(result.deletedObjects, 3);
  assert.equal(result.errors, 0);
});

test('published or still-claimed attempts remain untouched', async () => {
  const { client, deleted } = fixture();
  const result = await cleanupOrphanedHlsObjects({
    ...base,
    client,
    execute: true,
    isUnreferenced: async () => false,
  });
  assert.equal(result.skipped, 1);
  assert.equal(result.deletedObjects, 0);
  assert.deepEqual(deleted, []);
});

test('an attempt becoming referenced during the second check is preserved', async () => {
  const { client, deleted } = fixture();
  let checks = 0;
  const result = await cleanupOrphanedHlsObjects({
    ...base,
    client,
    execute: true,
    isUnreferenced: async () => ++checks === 1,
  });
  assert.equal(checks, 2);
  assert.equal(result.skipped, 1);
  assert.deepEqual(deleted, []);
});

test('fresh or unexpected objects prevent deletion of the whole attempt', async () => {
  const freshClient = fixture(
    keys.map((Key, index) => ({ Key, LastModified: index ? old : young })),
  );
  const freshReport = await cleanupOrphanedHlsObjects({
    ...base,
    client: freshClient.client,
    execute: true,
  });
  assert.equal(freshReport.skipped, 1);
  assert.deepEqual(freshClient.deleted, []);
  const malformed = fixture([
    ...keys.map((Key) => ({ Key, LastModified: old })),
    { Key: `${prefix}unrecognized.bin`, LastModified: old },
  ]);
  const badReport = await cleanupOrphanedHlsObjects({
    ...base,
    client: malformed.client,
    execute: true,
  });
  assert.equal(badReport.skipped, 1);
  assert.deepEqual(malformed.deleted, []);
});

test('S3 partial deletion failure is reported, never called a success', async () => {
  const { client } = fixture(undefined, { deleteError: true });
  const report = await cleanupOrphanedHlsObjects({ ...base, client, execute: true });
  assert.equal(report.errors, 1);
  assert.equal(report.deletedObjects, 0);
});

test('delete is chunked at 1000 keys without deleting outside the attempt prefix', async () => {
  const large = Array.from({ length: 1002 }, (_, index) => ({
    Key: `${prefix}240p/segment_${String(index).padStart(5, '0')}.ts`,
    LastModified: old,
  }));
  const { client, deleted, commands } = fixture(large);
  const report = await cleanupOrphanedHlsObjects({ ...base, client, execute: true });
  assert.equal(report.deletedObjects, 1002);
  assert.equal(deleted.length, 1002);
  const batches = commands.filter((cmd) => cmd instanceof DeleteObjectsCommand);
  assert.equal(batches.length, 2);
  assert.ok(deleted.every((key) => key.startsWith(prefix)));
});

test('unsafe age threshold and invalid cursor are rejected before touching storage', async () => {
  const { client } = fixture();
  await assert.rejects(
    cleanupOrphanedHlsObjects({ ...base, client, minAgeMs: 1 }),
    /OPTIONS_INVALID/u,
  );
  await assert.rejects(
    cleanupOrphanedHlsObjects({ ...base, client, startAfter: 'other-bucket/secret' }),
    /OPTIONS_INVALID/u,
  );
});

test('database safety query guards published renditions, master and active lease token', async () => {
  const attempt = parseHlsAttemptKey(keys[0]!)!;
  let tokenInDb: string | null = token;
  let masterExists = false;
  let renditionExists = false;
  const fakeDb = {
    video: {
      findUnique: async (input: { where: { id: string } }) => {
        assert.equal(input.where.id, videoId);
        return { processingLeaseToken: tokenInDb };
      },
    },
    mediaAsset: {
      findFirst: async (input: { where: { storageKey: { startsWith: string } } }) => {
        assert.equal(input.where.storageKey.startsWith, prefix);
        return masterExists ? { id: 'protected' } : null;
      },
    },
    videoRendition: {
      findFirst: async (input: { where: { playlistKey: { startsWith: string } } }) => {
        assert.equal(input.where.playlistKey.startsWith, prefix);
        return renditionExists ? { id: 'protected' } : null;
      },
    },
  };
  assert.equal(await isUnreferencedHlsAttempt(attempt, fakeDb as never), false);
  tokenInDb = null;
  assert.equal(await isUnreferencedHlsAttempt(attempt, fakeDb as never), true);
  masterExists = true;
  assert.equal(await isUnreferencedHlsAttempt(attempt, fakeDb as never), false);
  masterExists = false;
  renditionExists = true;
  assert.equal(await isUnreferencedHlsAttempt(attempt, fakeDb as never), false);
});

test('discovery cursor resumes later attempt without skipping it', async () => {
  const token2 = '00000000-0000-4000-8000-000000000002';
  const objects = [
    ...keys.map((Key) => ({ Key, LastModified: old })),
    { Key: `hls/${videoId}/v1/${token2}/master.m3u8`, LastModified: old },
  ];
  // S3 returns lexicographically sorted keys.
  objects.sort((a, b) => a.Key.localeCompare(b.Key));
  const { client } = fixture(objects);
  const first = await cleanupOrphanedHlsObjects({ ...base, client, maxCandidates: 1 });
  assert.equal(first.candidates, 1);
  assert.ok(first.nextStartAfter);
  const second = await cleanupOrphanedHlsObjects({
    ...base,
    client,
    maxCandidates: 1,
    startAfter: first.nextStartAfter,
  });
  assert.equal(second.candidates, 1);
  assert.equal(second.nextStartAfter, undefined);
});
