import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { prisma } from '../src/config/database.js';
import {
  createStorageClient,
  createUploadStorageService,
} from '../src/services/storage.service.js';
import { readStorageConfig } from '../src/config/storage-env.js';
import { insertOwnedUploadSession } from '../src/repositories/upload-session.repository.js';
import { signUpload } from '../src/services/upload-sign.service.js';
import { completeUpload } from '../src/services/upload-complete.service.js';
import { createUploadVerificationStorage } from '../src/services/upload-verify-storage.service.js';

/**
 * Requires migrated local PostgreSQL, Redis, S3/MinIO, a running API dispatcher,
 * and a separate running worker. No HTTP auth needed: checks the whole pipeline
 * starting at the real upload service, NOT the user-facing HTTP routes.
 * Disabled by default to avoid running FFmpeg/storage against the wrong environment.
 */
if (process.env.STREAMLAB_E2E_TRANSCODING !== '1' || process.env.NODE_ENV === 'production') {
  throw new Error('Run only in local development with STREAMLAB_E2E_TRANSCODING=1');
}
const run = promisify(execFile);
const ffmpeg = process.env.FFMPEG_PATH ?? 'ffmpeg';
// Explicit opt-in to exercise the multi-rendition ladder before STREAM-006.
const verifyAbr = process.env.STREAMLAB_E2E_ABR === '1';
const sourceSize = verifyAbr ? '1280x720' : '320x240';
const expectedLabels = verifyAbr ? ['240p', '360p', '480p', '720p'] : ['240p'];
const storageConfig = readStorageConfig();
const storageClient = createStorageClient(storageConfig);
const staging = createUploadStorageService({ client: storageClient, config: storageConfig });
const verified = createUploadVerificationStorage();
const tempDir = await mkdtemp(join(tmpdir(), 'streamlab-transcoding-e2e-'));
let userId: string | undefined;
let videoId: string | undefined;
let uploadId: string | undefined;
let originalKey: string | undefined;
let masterKey: string | undefined;
let passed = false;
try {
  // Generate an actual playable video; signature-only smoke inputs are not decodable.
  const source = join(tempDir, 'source.mp4');
  await run(
    ffmpeg,
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `testsrc2=size=${sourceSize}:rate=25`,
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=44100',
      '-t',
      '2',
      '-c:v',
      'mpeg4',
      '-c:a',
      'aac',
      '-shortest',
      '-y',
      source,
    ],
    { timeout: 30_000 },
  );
  const bytes = await readFile(source);
  const checksumSha256 = createHash('sha256').update(bytes).digest('hex');
  const user = await prisma.user.create({
    data: {
      email: `streamlab-e2e-${randomUUID()}@example.invalid`,
      displayName: 'HLS E2E',
      passwordHash: 'smoke-only',
    },
  });
  userId = user.id;
  const video = await prisma.video.create({ data: { ownerId: user.id, title: 'HLS E2E' } });
  videoId = video.id;
  const upload = await insertOwnedUploadSession(video.id, user.id, {
    fileName: 'e2e-source.mp4',
    contentType: 'video/mp4',
    sizeBytes: String(bytes.length),
    checksumSha256,
  });
  uploadId = upload.id;
  const signed = await signUpload(upload.id, user.id, { contentType: 'video/mp4' });
  const put = await fetch(signed.uploadUrl, {
    method: 'PUT',
    headers: signed.headers,
    body: bytes,
    signal: AbortSignal.timeout(30_000),
  });
  assert.ok(put.ok, `S3 staged PUT failed: ${put.status}`);
  const result = await completeUpload(upload.id, user.id);
  assert.equal(result.status, 'QUEUED');
  const original = await prisma.mediaAsset.findFirstOrThrow({
    where: { videoId: video.id, kind: 'ORIGINAL' },
  });
  originalKey = original.storageKey;
  assert.equal(await prisma.videoTranscodeOutbox.count({ where: { videoId: video.id } }), 1);

  // The API's automatic outbox dispatcher and the separately running worker must
  // consume the job. This script intentionally NEVER enqueues a job itself.
  const deadline = Date.now() + 120_000;
  let status = 'QUEUED';
  while (Date.now() < deadline) {
    const row = await prisma.video.findUniqueOrThrow({
      where: { id: video.id },
      select: { status: true },
    });
    status = row.status;
    if (status === 'READY' || status === 'FAILED') break;
    await sleep(1_000);
  }
  assert.equal(
    status,
    'READY',
    `Expected READY (got ${status}); check API dispatcher and worker logs`,
  );
  const asset = await prisma.mediaAsset.findFirstOrThrow({
    where: { videoId: video.id, kind: 'HLS_MASTER' },
  });
  masterKey = asset.storageKey;
  const renditions = await prisma.videoRendition.findMany({ where: { videoId: video.id } });
  assert.deepEqual(
    renditions.map((rendition) => rendition.label).sort(),
    [...expectedLabels].sort(),
    'Unexpected HLS rendition ladder',
  );
  const masterResponse = await storageClient.send(
    new GetObjectCommand({ Bucket: storageConfig.mediaBucket, Key: masterKey }),
  );
  const masterText = await masterResponse.Body?.transformToString();
  if (masterText === undefined) {
    throw new Error('HLS master playlist response body is missing');
  }
  assert.ok(masterText?.startsWith('#EXTM3U\n'));
  assert.equal(
    masterText.split(/\r?\n/u).filter((line) => line.startsWith('#EXT-X-STREAM-INF:')).length,
    expectedLabels.length,
    'Master playlist must advertise every rendition',
  );
  for (const rendition of renditions) {
    assert.ok(
      masterText.includes(`${rendition.label}/index.m3u8`),
      `Missing ${rendition.label} master entry`,
    );
    assert.ok(rendition.playlistKey.endsWith(`/${rendition.label}/index.m3u8`));
    const response = await storageClient.send(
      new GetObjectCommand({
        Bucket: storageConfig.mediaBucket,
        Key: rendition.playlistKey,
      }),
    );
    const playlist = await response.Body?.transformToString();
    if (playlist === undefined) {
      throw new Error(`HLS variant playlist response body is missing: ${rendition.label}`);
    }
    assert.ok(playlist?.startsWith('#EXTM3U\n') && playlist.includes('#EXT-X-ENDLIST'));
    const segments = playlist
      .split(/\r?\n/u)
      .filter((line) => /^segment_[0-9]{5,8}\.ts$/u.test(line));
    assert.ok(segments.length > 0, `No segments found for ${rendition.label}`);
    // Checking segment existence (not downloading the media) validates the
    // playable path from each variant manifest to the uploaded TS objects.
    for (const segment of segments) {
      const key = rendition.playlistKey.slice(0, -'index.m3u8'.length) + segment;
      const head = await storageClient.send(
        new HeadObjectCommand({
          Bucket: storageConfig.mediaBucket,
          Key: key,
        }),
      );
      assert.ok((head.ContentLength ?? 0) > 0, `Empty HLS segment: ${rendition.label}/${segment}`);
    }
  }
  console.log(
    `PASS: upload -> QUEUED -> outbox -> BullMQ -> FFmpeg -> S3 -> READY, renditions=${renditions.length}, mode=${verifyAbr ? 'ABR' : 'baseline'}`,
  );
  passed = true;
} finally {
  await rm(tempDir, { recursive: true, force: true });
  // On failure preserve DB and storage evidence for diagnosis, printing only IDs.
  if (!passed)
    console.error(
      `E2E failed; inspect test records videoId=${videoId ?? 'none'}, uploadId=${uploadId ?? 'none'}`,
    );
  if (passed && videoId && uploadId && userId) {
    try {
      if (masterKey) {
        const prefix = masterKey.slice(0, -'master.m3u8'.length);
        let continuationToken: string | undefined;
        do {
          const page = await storageClient.send(
            new ListObjectsV2Command({
              Bucket: storageConfig.mediaBucket,
              Prefix: prefix,
              ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
            }),
          );
          const objects = (page.Contents ?? []).flatMap(({ Key }) => (Key ? [{ Key }] : []));
          if (objects.length) {
            const response = await storageClient.send(
              new DeleteObjectsCommand({
                Bucket: storageConfig.mediaBucket,
                Delete: { Objects: objects, Quiet: true },
              }),
            );
            assert.equal(response.Errors?.length ?? 0, 0);
          }
          continuationToken = page.NextContinuationToken;
        } while (continuationToken);
      }
      if (originalKey) await verified.removeVerified(originalKey);
      await staging.deleteStaging({ videoId, uploadId });
      await prisma.videoRendition.deleteMany({ where: { videoId } });
      await prisma.videoTranscodeOutbox.deleteMany({ where: { videoId } });
      await prisma.mediaAsset.deleteMany({ where: { videoId } });
      await prisma.videoUpload.deleteMany({ where: { videoId } });
      await prisma.video.delete({ where: { id: videoId } });
      await prisma.user.delete({ where: { id: userId } });
    } catch (cleanupError) {
      console.error('E2E cleanup failed', cleanupError);
      process.exitCode = 1;
    }
  }
  storageClient.destroy();
  await prisma.$disconnect();
}
