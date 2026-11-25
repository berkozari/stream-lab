import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const PROBE_MAX_BUFFER = 1024 * 1024;
const PROBE_TIMEOUT_MS = 30_000;

export type VideoProbe = {
  durationSeconds: number;
  width: number;
  height: number;
  codec: string;
  hasAudio: boolean;
};

/** Only extract bounded, typed fields from untrusted FFprobe output. */
export function parseVideoProbe(raw: string): VideoProbe {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('FFPROBE_JSON_INVALID');
  }
  if (!value || typeof value !== 'object') throw new Error('FFPROBE_METADATA_INVALID');
  const result = value as { streams?: unknown; format?: unknown };
  if (!Array.isArray(result.streams)) throw new Error('FFPROBE_STREAMS_MISSING');
  const streams = result.streams.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === 'object' && !Array.isArray(item),
  );
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (!video) throw new Error('FFPROBE_VIDEO_STREAM_MISSING');
  const width = video.width;
  const height = video.height;
  const codec = video.codec_name;
  if (
    typeof width !== 'number' ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > 16384 ||
    typeof height !== 'number' ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 16384 ||
    typeof codec !== 'string' ||
    !/^[a-zA-Z0-9_]{1,64}$/u.test(codec)
  ) {
    throw new Error('FFPROBE_VIDEO_METADATA_INVALID');
  }
  const format =
    result.format && typeof result.format === 'object'
      ? (result.format as Record<string, unknown>)
      : {};
  const duration = Number(format.duration ?? video.duration);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400)
    throw new Error('FFPROBE_DURATION_INVALID');
  return {
    durationSeconds: duration,
    width,
    height,
    codec,
    hasAudio: streams.some((stream) => stream.codec_type === 'audio'),
  };
}

/** No shell, bounded execution time/output, and a local server-created path only. */
export async function probeLocalVideo(
  filePath: string,
  executable = process.env.FFPROBE_PATH ?? 'ffprobe',
  signal?: AbortSignal,
): Promise<VideoProbe> {
  try {
    const { stdout } = await execFileAsync(
      executable,
      ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', filePath],
      { timeout: PROBE_TIMEOUT_MS, maxBuffer: PROBE_MAX_BUFFER, windowsHide: true, signal },
    );
    return parseVideoProbe(stdout);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('FFPROBE_')) {
      throw error;
    }

    throw new Error('FFPROBE_EXECUTION_FAILED', {
      cause: error,
    });
  }
}
