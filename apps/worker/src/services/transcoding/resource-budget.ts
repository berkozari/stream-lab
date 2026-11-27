import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { UnrecoverableError } from 'bullmq';
import type { VideoProbe } from '../ffprobe/probe.js';
import { planHlsProfiles } from './hls-profiles.js';

/** Keep in sync with the bounded HLS orphan reaper. */
export const MAX_HLS_OBJECTS_PER_ATTEMPT = 20_000;
const MiB = 1024 * 1024;

export type TranscodingBudget = {
  maxDurationSeconds: number;
  maxSourcePixels: number;
  minScratchFreeBytes: bigint;
  ffmpegThreads: number;
  ffmpegProfileTimeoutMs: number;
};

function boundedInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`TRANSCODING_CONFIG_INVALID:${name}`);
  }
  return parsed;
}

/** Conservative defaults, override after staging capacity measurements. */
export function readTranscodingBudget(env: NodeJS.ProcessEnv = process.env): TranscodingBudget {
  return {
    maxDurationSeconds: boundedInteger(env, 'TRANSCODE_MAX_DURATION_SECONDS', 14_400, 1, 86_400),
    maxSourcePixels: boundedInteger(env, 'TRANSCODE_MAX_SOURCE_PIXELS', 8_294_400, 4, 268_435_456),
    minScratchFreeBytes: BigInt(
      boundedInteger(env, 'TRANSCODE_MIN_SCRATCH_FREE_BYTES', 512 * MiB, 0, 128 * 1024 * MiB),
    ),
    ffmpegThreads: boundedInteger(env, 'TRANSCODE_FFMPEG_THREADS', 2, 1, 16),
    ffmpegProfileTimeoutMs: boundedInteger(
      env,
      'TRANSCODE_FFMPEG_PROFILE_TIMEOUT_MS',
      2 * 60 * 60_000,
      1_000,
      2 * 60 * 60_000,
    ),
  };
}

export type ScratchCheckOptions = {
  budget?: TranscodingBudget;
  /** Injectable for deterministic tests; production uses statfs on OS temp mount. */
  availableBytes?: () => Promise<bigint>;
};

async function freeScratchBytes(): Promise<bigint> {
  const stats = await statfs(tmpdir());
  return BigInt(stats.bavail) * BigInt(stats.bsize);
}

async function assertScratchCapacity(
  neededBytes: bigint,
  signal: AbortSignal,
  options: ScratchCheckOptions,
): Promise<void> {
  if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
  let available: bigint;
  try {
    available = await (options.availableBytes ?? freeScratchBytes)();
  } catch (error) {
    throw new Error('TRANSCODING_SCRATCH_CHECK_FAILED', { cause: error });
  }
  if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
  if (available < neededBytes) throw new Error('TRANSCODING_SCRATCH_INSUFFICIENT');
}

/** Before download: reserve room for the original plus configured free-space margin. */
export async function assertSourceScratchCapacity(
  sourceBytes: bigint,
  signal: AbortSignal,
  options: ScratchCheckOptions = {},
): Promise<void> {
  const budget = options.budget ?? readTranscodingBudget();
  if (sourceBytes <= 0n) throw new UnrecoverableError('TRANSCODING_SOURCE_SIZE_INVALID');
  await assertScratchCapacity(sourceBytes + budget.minScratchFreeBytes, signal, options);
}

/** After probing: admit media by duration/pixels/object count and estimated HLS scratch. */
export async function assertTranscodingResources(
  probe: VideoProbe,
  signal: AbortSignal,
  options: ScratchCheckOptions = {},
): Promise<void> {
  if (signal.aborted) throw new Error('TRANSCODING_CANCELLED');
  const budget = options.budget ?? readTranscodingBudget();
  if (
    !Number.isFinite(probe.durationSeconds) ||
    probe.durationSeconds <= 0 ||
    probe.durationSeconds > budget.maxDurationSeconds ||
    !Number.isSafeInteger(probe.width) ||
    !Number.isSafeInteger(probe.height) ||
    probe.width < 2 ||
    probe.height < 2 ||
    probe.width * probe.height > budget.maxSourcePixels
  ) {
    throw new UnrecoverableError('TRANSCODING_MEDIA_BUDGET_EXCEEDED');
  }
  const profiles = planHlsProfiles(probe);
  // HLS produces roughly one segment per four seconds per rendition. An extra
  // segment per profile covers rounding, and playlist/master objects count too.
  const expectedObjects = profiles.length * (Math.ceil(probe.durationSeconds / 4) + 2) + 1;
  if (expectedObjects > MAX_HLS_OBJECTS_PER_ATTEMPT) {
    throw new UnrecoverableError('TRANSCODING_HLS_OBJECT_BUDGET_EXCEEDED');
  }
  const totalBitrate = profiles.reduce(
    (sum, profile) => sum + profile.videoBitrate + profile.audioBitrate,
    0,
  );
  // Existing original is already on disk. Allow 2x nominal encoded bitrate for
  // TS overhead / peak fragments, plus a reserve for the remaining filesystem.
  const estimatedOutputBytes = BigInt(Math.ceil((probe.durationSeconds * totalBitrate) / 4));
  await assertScratchCapacity(estimatedOutputBytes + budget.minScratchFreeBytes, signal, options);
}
