import { PlaybackResponseSchema, type PlaybackResponse } from '@streamlab/contracts';
import { readPlaybackConfig, type PlaybackConfig } from '../config/playback-env.js';
import {
  signPlaybackCapability,
  verifyPlaybackCapability,
  type PlaybackCapability,
} from '../lib/playback-capability.js';
import { findPlaybackVideo, type PlaybackRecord } from '../repositories/playback.repository.js';
import { AppError } from '../utils/app-error.js';

export type PlaybackViewer = { userId: string; role: 'USER' | 'ADMIN' };
export type PlaybackReader = (videoId: string) => Promise<PlaybackRecord | null>;
export type PlaybackHandler = (
  videoId: string,
  viewer?: PlaybackViewer,
) => Promise<PlaybackResponse>;
export type MediaClaim = {
  video: PlaybackRecord;
  capability: PlaybackCapability;
  config: PlaybackConfig;
};

const notFound = () => new AppError(404, 'VIDEO_NOT_FOUND', 'Video not found');

function canWatch(video: PlaybackRecord, viewer?: PlaybackViewer): boolean {
  const privileged = viewer?.role === 'ADMIN' || viewer?.userId === video.ownerId;
  return Boolean(
    privileged ||
    (video.visibility !== 'PRIVATE' && video.publishedAt !== null && video.status === 'READY'),
  );
}

export function requirePlayable(
  video: PlaybackRecord | null,
  viewer?: PlaybackViewer,
): PlaybackRecord {
  if (!video || !canWatch(video, viewer)) throw notFound();
  if (video.status !== 'READY') {
    throw new AppError(409, 'VIDEO_NOT_READY', 'Video is not ready for playback');
  }
  const master = video.mediaAssets.find(
    (asset) =>
      asset.processingVersion === video.processingVersion &&
      asset.storageKey.endsWith('/master.m3u8'),
  );
  if (
    !master ||
    !video.renditions.some((rendition) => rendition.processingVersion === video.processingVersion)
  ) {
    throw new AppError(409, 'PLAYBACK_NOT_AVAILABLE', 'Video playback is not available');
  }
  return video;
}

export function createPlaybackService(
  read: PlaybackReader = findPlaybackVideo,
  getConfig: () => PlaybackConfig = readPlaybackConfig,
  clock: () => number = Date.now,
): PlaybackHandler {
  return async (videoId, viewer) => {
    const video = requirePlayable(await read(videoId), viewer);
    const config = getConfig();
    const expiresAtMs = (Math.floor(clock() / 1000) + config.ttlSeconds) * 1000;
    const token = signPlaybackCapability(
      {
        v: 1,
        videoId: video.id,
        processingVersion: video.processingVersion,
        exp: expiresAtMs / 1000,
        viewerId: viewer?.userId ?? null,
        viewerRole: viewer?.role ?? null,
      },
      config.secret,
    );
    const url = new URL(
      `/api/v1/videos/${video.id}/playback/hls/master.m3u8`,
      config.publicBaseUrl,
    );
    url.searchParams.set('token', token);
    return PlaybackResponseSchema.parse({
      videoId: video.id,
      protocol: 'HLS',
      manifestUrl: url.toString(),
      expiresAt: new Date(expiresAtMs).toISOString(),
    });
  };
}

/** Recheck READY + visibility/version for every manifest and segment redirect. */
export async function authorizeMediaClaim(
  videoId: string,
  token: unknown,
  read: PlaybackReader = findPlaybackVideo,
  getConfig: () => PlaybackConfig = readPlaybackConfig,
  clock: () => number = Date.now,
): Promise<MediaClaim> {
  const config = getConfig();
  const capability = verifyPlaybackCapability(token, config.secret, clock());
  if (capability.videoId !== videoId) throw notFound();
  const viewer =
    capability.viewerId && capability.viewerRole
      ? { userId: capability.viewerId, role: capability.viewerRole }
      : undefined;
  const record = await read(videoId);

  if (!record || record.processingVersion !== capability.processingVersion) {
    throw notFound();
  }

  const video = requirePlayable(record, viewer);

  return { video, capability, config };
}

export const getVideoPlayback = createPlaybackService();
