import { createReadStream } from 'node:fs';
import { DeleteObjectsCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { VideoTranscodeJobData } from '@streamlab/contracts';
import {
  createWorkerStorageClient,
  readWorkerStorageConfig,
  type WorkerStorageConfig,
} from '../../config/storage.js';
import type { HlsOutputFile } from '../transcoding/ffmpeg-hls.js';

export type UploadedHls = {
  prefix: string;
  masterKey: string;
  keyFor: (relativePath: string) => string;
  cleanup: () => Promise<void>;
};

/** Token-specific paths prevent old/retried workers from overwriting published assets. */
export function hlsAttemptPrefix(job: VideoTranscodeJobData, token: string): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
  if (
    !uuid.test(job.videoId) ||
    !uuid.test(token) ||
    !Number.isSafeInteger(job.processingVersion) ||
    job.processingVersion < 1
  ) {
    throw new Error('HLS_INVALID_ATTEMPT_KEY');
  }
  return `hls/${job.videoId}/v${job.processingVersion}/${token.toLowerCase()}/`;
}

/** Upload master LAST. Never claim READY while storage is incomplete. */
export async function uploadHlsOutput(
  job: VideoTranscodeJobData,
  token: string,
  files: HlsOutputFile[],
  signal: AbortSignal,
  options: { client?: S3Client; config?: WorkerStorageConfig } = {},
): Promise<UploadedHls> {
  const prefix = hlsAttemptPrefix(job, token);
  const config = options.config ?? readWorkerStorageConfig();
  const client = options.client ?? createWorkerStorageClient(config);
  const safeRelative = /^(?:[a-z0-9]+\/)?(?:index|master|segment_[0-9]{5,8})\.(?:m3u8|ts)$/u;
  const master = files.filter((file) => file.relativePath === 'master.m3u8');
  if (
    master.length !== 1 ||
    files.length < 3 ||
    files.some(
      (file) =>
        !safeRelative.test(file.relativePath) ||
        file.sizeBytes < 1n ||
        file.sizeBytes > 5_000_000_000n,
    ) ||
    new Set(files.map((file) => file.relativePath)).size !== files.length
  ) {
    throw new Error('HLS_UPLOAD_MANIFEST_INVALID');
  }
  const keyFor = (relativePath: string) => `${prefix}${relativePath}`;
  const queuedKeys: string[] = [];
  const cleanup = async () => {
    // S3 DeleteObjects accepts at most 1,000 keys per request.
    for (let i = 0; i < queuedKeys.length; i += 1000) {
      const response = await client.send(
        new DeleteObjectsCommand({
          Bucket: config.mediaBucket,
          Delete: { Objects: queuedKeys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
        }),
      );
      if (response.Errors?.length) throw new Error('HLS_STORAGE_CLEANUP_FAILED');
    }
  };
  const orderedFiles = [...files.filter((file) => file.relativePath !== 'master.m3u8'), master[0]!];
  try {
    for (const file of orderedFiles) {
      if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
      const key = keyFor(file.relativePath);
      queuedKeys.push(key); // track before send: a timed-out PUT may already have succeeded
      const stream = createReadStream(file.absolutePath);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: config.mediaBucket,
            Key: key,
            Body: stream,
            ContentLength: Number(file.sizeBytes),
            ContentType: file.contentType,
            CacheControl: 'private, max-age=31536000, immutable',
          }),
          { abortSignal: signal },
        );
      } finally {
        stream.destroy();
      }
    }
  } catch (error) {
    try {
      await cleanup();
    } catch {
      console.warn('[worker] failed to clean partial HLS upload');
    }
    throw error;
  }
  return { prefix, masterKey: keyFor('master.m3u8'), keyFor, cleanup };
}
