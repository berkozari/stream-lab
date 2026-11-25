import { DeleteObjectsCommand, ListObjectsV2Command, type S3Client } from '@aws-sdk/client-s3';
import type { workerPrisma } from '../../config/database.js';
import {
  createWorkerStorageClient,
  readWorkerStorageConfig,
  type WorkerStorageConfig,
} from '../../config/storage.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ATTEMPT_KEY = new RegExp(`^hls/(${UUID})/v([1-9][0-9]*)/(${UUID})/(.+)$`, 'iu');
const EXPECTED_FILE = /^(?:master\.m3u8|[a-z0-9]+\/(?:index\.m3u8|segment_[0-9]{5,8}\.ts))$/u;
const MIN_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_OBJECTS_PER_ATTEMPT = 20_000;

export type HlsAttempt = {
  videoId: string;
  processingVersion: number;
  claimToken: string;
  prefix: string;
};

/** Never accept arbitrary user-provided storage prefixes for deletion. */
export function parseHlsAttemptKey(key: string): HlsAttempt | null {
  const match = ATTEMPT_KEY.exec(key);
  if (!match) return null;
  const version = Number(match[2]);
  if (!Number.isSafeInteger(version) || version < 1) return null;
  return {
    videoId: match[1]!.toLowerCase(),
    processingVersion: version,
    claimToken: match[3]!.toLowerCase(),
    prefix: `hls/${match[1]!.toLowerCase()}/v${version}/${match[3]!.toLowerCase()}/`,
  };
}

/**
 * A currently claimed attempt or any prefix referenced by DB metadata must
 * never be removed, including if its lease has expired (the worker may be slow).
 * Failed or crashed attempts can be removed only when DB no longer owns them.
 */
export type HlsOrphanSafetyDb = Pick<
  typeof workerPrisma,
  'video' | 'mediaAsset' | 'videoRendition'
>;
export async function isUnreferencedHlsAttempt(
  attempt: HlsAttempt,
  db?: HlsOrphanSafetyDb,
): Promise<boolean> {
  // Dynamic import keeps pure unit tests independent from live DB/env setup.
  const prisma = db ?? (await import('../../config/database.js')).workerPrisma;
  const [video, master, rendition] = await Promise.all([
    prisma.video.findUnique({
      where: { id: attempt.videoId },
      select: { processingLeaseToken: true },
    }),
    prisma.mediaAsset.findFirst({
      where: {
        videoId: attempt.videoId,
        kind: 'HLS_MASTER',
        storageKey: { startsWith: attempt.prefix },
      },
      select: { id: true },
    }),
    prisma.videoRendition.findFirst({
      where: { videoId: attempt.videoId, playlistKey: { startsWith: attempt.prefix } },
      select: { id: true },
    }),
  ]);
  return !master && !rendition && video?.processingLeaseToken?.toLowerCase() !== attempt.claimToken;
}

export type HlsOrphanCleanupOptions = {
  /** Deletion is always opt-in. Omitting execute performs a dry-run. */
  execute?: boolean;
  now?: Date;
  minAgeMs?: number;
  maxCandidates?: number;
  maxDiscoveryPages?: number;
  startAfter?: string;
  client?: S3Client;
  config?: WorkerStorageConfig;
  isUnreferenced?: (attempt: HlsAttempt) => Promise<boolean>;
};

export type HlsOrphanCleanupReport = {
  mode: 'dry-run' | 'execute';
  examined: number;
  candidates: number;
  eligible: number;
  skipped: number;
  deletedObjects: number;
  errors: number;
  nextStartAfter?: string;
};

/**
 * Opt-in and bounded HLS orphan reaper. The S3 listing cursor may be passed
 * back as startAfter; there is deliberately NO automatic background deletion.
 * Every discovered attempt is re-listed to completion and re-checked against DB
 * immediately before any delete. Cleanup failures are safe to retry.
 */
export async function cleanupOrphanedHlsObjects(
  options: HlsOrphanCleanupOptions = {},
): Promise<HlsOrphanCleanupReport> {
  const now = options.now ?? new Date();
  const minAgeMs = options.minAgeMs ?? DEFAULT_AGE_MS;
  const maxCandidates = options.maxCandidates ?? 10;
  const maxDiscoveryPages = options.maxDiscoveryPages ?? 5;
  if (
    !Number.isFinite(now.getTime()) ||
    !Number.isSafeInteger(minAgeMs) ||
    minAgeMs < MIN_AGE_MS ||
    !Number.isInteger(maxCandidates) ||
    maxCandidates < 1 ||
    maxCandidates > 100 ||
    !Number.isInteger(maxDiscoveryPages) ||
    maxDiscoveryPages < 1 ||
    maxDiscoveryPages > 20 ||
    (options.startAfter !== undefined &&
      (!options.startAfter.startsWith('hls/') || /[\r\n]/u.test(options.startAfter)))
  ) {
    throw new Error('HLS_ORPHAN_CLEANUP_OPTIONS_INVALID');
  }
  const config = options.config ?? readWorkerStorageConfig();
  const ownsClient = !options.client;
  const client = options.client ?? createWorkerStorageClient(config);
  const check = options.isUnreferenced ?? isUnreferencedHlsAttempt;
  const report: HlsOrphanCleanupReport = {
    mode: options.execute ? 'execute' : 'dry-run',
    examined: 0,
    candidates: 0,
    eligible: 0,
    skipped: 0,
    deletedObjects: 0,
    errors: 0,
  };
  const attempts = new Map<string, HlsAttempt>();
  let lastSeenKey = options.startAfter;
  let continuationToken: string | undefined;
  let hasMore = false;
  try {
    discovery: for (let page = 0; page < maxDiscoveryPages; page++) {
      const batch = await client.send(
        new ListObjectsV2Command({
          Bucket: config.mediaBucket,
          Prefix: 'hls/',
          MaxKeys: 1000,
          ...(page === 0 && options.startAfter ? { StartAfter: options.startAfter } : {}),
          ...(continuationToken ? { ContinuationToken: continuationToken } : {}),
        }),
      );
      for (const object of batch.Contents ?? []) {
        if (!object.Key) continue;
        const attempt = parseHlsAttemptKey(object.Key);
        if (attempt && !attempts.has(attempt.prefix) && attempts.size === maxCandidates) {
          hasMore = true;
          break discovery;
        }
        lastSeenKey = object.Key;
        report.examined++;
        if (attempt) attempts.set(attempt.prefix, attempt);
      }
      if (!batch.IsTruncated) {
        hasMore = false;
        break;
      }
      if (!batch.NextContinuationToken) throw new Error('HLS_ORPHAN_DISCOVERY_CURSOR_MISSING');
      continuationToken = batch.NextContinuationToken;
      hasMore = true;
      if (page + 1 === maxDiscoveryPages) break;
    }
    report.candidates = attempts.size;
    if (hasMore && lastSeenKey) report.nextStartAfter = lastSeenKey;

    for (const attempt of attempts.values()) {
      try {
        // Listing first allows skipping intact/new attempts before DB access.
        const keys: string[] = [];
        let next: string | undefined;
        let fresh = false;
        let malformed = false;
        do {
          const batch = await client.send(
            new ListObjectsV2Command({
              Bucket: config.mediaBucket,
              Prefix: attempt.prefix,
              MaxKeys: 1000,
              ...(next ? { ContinuationToken: next } : {}),
            }),
          );
          for (const object of batch.Contents ?? []) {
            const key = object.Key;
            if (
              !key ||
              !key.startsWith(attempt.prefix) ||
              !EXPECTED_FILE.test(key.slice(attempt.prefix.length)) ||
              !object.LastModified ||
              !Number.isFinite(object.LastModified.getTime())
            ) {
              malformed = true;
              break;
            }
            if (object.LastModified.getTime() > now.getTime() - minAgeMs) fresh = true;
            keys.push(key);
          }
          if (malformed || fresh || keys.length > MAX_OBJECTS_PER_ATTEMPT) break;
          if (batch.IsTruncated && !batch.NextContinuationToken)
            throw new Error('HLS_ORPHAN_PREFIX_CURSOR_MISSING');
          next = batch.IsTruncated ? batch.NextContinuationToken : undefined;
        } while (next);

        if (
          malformed ||
          fresh ||
          !keys.length ||
          keys.length > MAX_OBJECTS_PER_ATTEMPT ||
          !(await check(attempt))
        ) {
          report.skipped++;
          continue;
        }
        report.eligible++;
        if (!options.execute) continue;

        // Recheck ownership in case a prior DB read raced with a publish.
        if (!(await check(attempt))) {
          report.skipped++;
          report.eligible--;
          continue;
        }
        for (let i = 0; i < keys.length; i += 1000) {
          const response = await client.send(
            new DeleteObjectsCommand({
              Bucket: config.mediaBucket,
              Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
            }),
          );
          if (response.Errors?.length) throw new Error('HLS_ORPHAN_DELETE_PARTIAL_FAILURE');
          report.deletedObjects += Math.min(1000, keys.length - i);
        }
      } catch {
        // Never silently declare an attempt cleaned after partial S3 failure.
        report.errors++;
      }
    }
    return report;
  } finally {
    if (ownsClient) client.destroy();
  }
}
