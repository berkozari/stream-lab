import type { VideoProbe } from '../ffprobe/probe.js';

export type HlsProfile = {
  label: string;
  width: number;
  height: number;
  videoBitrate: number;
  audioBitrate: number;
};

const LADDER = [
  { label: '240p', width: 426, height: 240, videoBitrate: 400_000 },
  { label: '360p', width: 640, height: 360, videoBitrate: 800_000 },
  { label: '480p', width: 854, height: 480, videoBitrate: 1_400_000 },
  { label: '720p', width: 1280, height: 720, videoBitrate: 2_800_000 },
  { label: '1080p', width: 1920, height: 1080, videoBitrate: 5_000_000 },
] as const;

function evenFloor(value: number): number {
  return Math.floor(value / 2) * 2;
}

/** No upscaling, dimensions always even for H.264 yuv420p. */
export function planHlsProfiles(probe: VideoProbe): HlsProfile[] {
  if (
    !Number.isInteger(probe.width) ||
    !Number.isInteger(probe.height) ||
    probe.width < 2 ||
    probe.height < 2
  )
    throw new Error('HLS_SOURCE_TOO_SMALL');
  const candidates = LADDER.filter((entry) => entry.height <= probe.height);
  const selected = candidates.length
    ? candidates
    : [
        {
          label: 'source',
          width: probe.width,
          height: probe.height,
          videoBitrate: 300_000,
        },
      ];
  const results: HlsProfile[] = [];
  for (const entry of selected) {
    // Fit within both source bounds and the target landscape/portrait envelope.
    const scale = Math.min(1, entry.width / probe.width, entry.height / probe.height);
    const width = evenFloor(probe.width * scale);
    const height = evenFloor(probe.height * scale);
    if (width < 2 || height < 2) continue;
    if (results.some((previous) => previous.width === width && previous.height === height))
      continue;
    results.push({
      label: entry.label,
      width,
      height,
      videoBitrate: entry.videoBitrate,
      audioBitrate: probe.hasAudio ? 96_000 : 0,
    });
  }
  if (!results.length) throw new Error('HLS_NO_VALID_PROFILES');
  return results;
}

/** Bandwidth includes audio and a modest transport overhead. */
export function renderHlsMaster(profiles: HlsProfile[]): string {
  if (!profiles.length) throw new Error('HLS_NO_VALID_PROFILES');
  return (
    '#EXTM3U\n#EXT-X-VERSION:3\n' +
    profiles
      .map(
        (profile) =>
          `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil((profile.videoBitrate + profile.audioBitrate) * 1.15)},RESOLUTION=${profile.width}x${profile.height}\n${profile.label}/index.m3u8\n`,
      )
      .join('')
  );
}
