import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { UPLOAD_LIMITS } from '@streamlab/contracts';
import {
  createWorkerStorageClient,
  readWorkerStorageConfig,
  type WorkerStorageConfig,
} from '../../config/storage.js';

export type OriginalSource = { storageKey: string; sizeBytes: bigint };
const ORIGINAL_KEY = /^originals\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/source$/u;

/** A one-use local copy for ffprobe/ffmpeg. Caller MUST invoke cleanup in finally. */
export async function downloadVerifiedOriginal(
  source: OriginalSource,
  options: { config?: WorkerStorageConfig; client?: S3Client; signal?: AbortSignal } = {},
): Promise<{ filePath: string; cleanup: () => Promise<void> }> {
  if (!ORIGINAL_KEY.test(source.storageKey)) throw new Error('INVALID_ORIGINAL_STORAGE_KEY');
  if (source.sizeBytes < 1n || source.sizeBytes > BigInt(UPLOAD_LIMITS.maxFileSizeBytes)) {
    throw new Error('INVALID_ORIGINAL_SIZE');
  }
  if (options.signal?.aborted) throw new Error('TRANSCODING_CANCELLED');
  const config = options.config ?? readWorkerStorageConfig();
  const client = options.client ?? createWorkerStorageClient(config);
  const directory = await mkdtemp(join(tmpdir(), 'streamlab-probe-'));
  const filePath = join(directory, 'source');
  const cleanup = async () => {
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: config.mediaBucket, Key: source.storageKey }),
      { abortSignal: options.signal },
    );
    const body: unknown = response.Body;
    if (
      !body ||
      typeof body !== 'object' ||
      !(Symbol.asyncIterator in body) ||
      typeof body[Symbol.asyncIterator] !== 'function'
    ) {
      throw new Error('ORIGINAL_STREAM_MISSING');
    }
    if (
      response.ContentLength !== undefined &&
      BigInt(response.ContentLength) !== source.sizeBytes
    ) {
      throw new Error('ORIGINAL_SIZE_CHANGED');
    }
    let bytes = 0n;
    const limit = source.sizeBytes;
    const counter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        bytes += BigInt(chunk.length);
        if (bytes > limit) callback(new Error('ORIGINAL_TOO_LARGE'));
        else callback(null, chunk);
      },
    });
    await pipeline(
      Readable.from(body as AsyncIterable<Uint8Array>),
      counter,
      createWriteStream(filePath, { flags: 'wx', mode: 0o600 }),
      { signal: options.signal },
    );
    if (bytes !== source.sizeBytes) throw new Error('ORIGINAL_SIZE_CHANGED');
    return { filePath, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
