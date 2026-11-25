import { signHlsSegmentUrls } from './hls-segment-signing.js';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createStorageClient } from './storage.service.js';
import { readStorageConfig } from '../config/storage-env.js';
import { AppError } from '../utils/app-error.js';
import { authorizeMediaClaim, type MediaClaim } from './playback.service.js';

export type PlaybackHlsStorage = {
  readVariant: (key: string) => Promise<string>;
  signSegment: (key: string, publicEndpoint: string, expiresInSeconds?: number) => Promise<string>;
};

/** Reads happen via the internal S3 endpoint; redirects use the browser-reachable endpoint. */
export function createPlaybackHlsStorage(): PlaybackHlsStorage {
  const config = readStorageConfig();
  const privateClient = createStorageClient(config);
  const publicClients = new Map<string, ReturnType<typeof createStorageClient>>();
  return {
    async readVariant(key) {
      const response = await privateClient.send(
        new GetObjectCommand({
          Bucket: config.mediaBucket,
          Key: key,
        }),
      );
      if (!response.Body || (response.ContentLength ?? 0) > 2_000_000) {
        throw new AppError(502, 'HLS_PLAYLIST_INVALID', 'HLS playlist is unavailable');
      }
      const text = await response.Body.transformToString();
      if (Buffer.byteLength(text, 'utf8') > 2_000_000) {
        throw new AppError(502, 'HLS_PLAYLIST_INVALID', 'HLS playlist is too large');
      }
      return text;
    },
    async signSegment(key, publicEndpoint, expiresInSeconds = 60) {
      let client = publicClients.get(publicEndpoint);
      if (!client) {
        client = createStorageClient({ ...config, endpoint: publicEndpoint });
        publicClients.set(publicEndpoint, client);
      }
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: config.mediaBucket,
          Key: key,
          ResponseContentType: 'video/mp2t',
        }),
        { expiresIn: expiresInSeconds },
      );
    },
  };
}

const missing = () => new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
const invalid = () => new AppError(502, 'HLS_PLAYLIST_INVALID', 'HLS playlist is invalid');
const safeLabel = /^[a-z0-9]{1,20}$/u;
const safeSegment = /^segment_[0-9]{5,8}\.ts$/u;
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
let sharedStorage: PlaybackHlsStorage | undefined;
function defaultStorage(): PlaybackHlsStorage {
  sharedStorage ??= createPlaybackHlsStorage();
  return sharedStorage;
}

function playbackPrefix(claim: MediaClaim): string {
  const { video } = claim;
  const asset = video.mediaAssets.find(
    (item) =>
      item.processingVersion === video.processingVersion &&
      item.storageKey.endsWith('/master.m3u8'),
  );
  if (!asset) throw missing();
  const prefixPattern = new RegExp(
    `^hls/${video.id}/v${video.processingVersion}/(${uuid})/master\\.m3u8$`,
    'u',
  );
  if (!prefixPattern.test(asset.storageKey)) throw missing();
  return asset.storageKey.slice(0, -'master.m3u8'.length);
}

function findRendition(claim: MediaClaim, prefix: string, label: string) {
  if (!safeLabel.test(label)) throw missing();
  const rendition = claim.video.renditions.find(
    (item) =>
      item.processingVersion === claim.video.processingVersion &&
      item.label === label &&
      item.playlistKey === `${prefix}${label}/index.m3u8`,
  );
  if (!rendition) throw missing();
  return rendition;
}

function mediaUrl(claim: MediaClaim, label: string, file: string, token: string): string {
  const url = new URL(
    `/api/v1/videos/${claim.video.id}/playback/hls/${label}/${file}`,
    claim.config.publicBaseUrl,
  );
  url.searchParams.set('token', token);
  return url.toString();
}

export type PlaybackManifestHandler = (videoId: string, token: unknown) => Promise<string>;
export type PlaybackVariantHandler = (
  videoId: string,
  label: string,
  token: unknown,
) => Promise<string>;
export type PlaybackSegmentHandler = (
  videoId: string,
  label: string,
  segment: string,
  token: unknown,
) => Promise<string>;

/** Master is generated from committed rendition rows; no untrusted path is passed through. */
export function createPlaybackMasterService(
  authorize: (videoId: string, token: unknown) => Promise<MediaClaim> = authorizeMediaClaim,
): PlaybackManifestHandler {
  return async (videoId, token) => {
    const claim = await authorize(videoId, token);
    const prefix = playbackPrefix(claim);
    const profiles = claim.video.renditions
      .filter(
        (item) =>
          item.processingVersion === claim.video.processingVersion &&
          safeLabel.test(item.label) &&
          item.playlistKey === `${prefix}${item.label}/index.m3u8`,
      )
      .sort((a, b) => a.bitrate - b.bitrate);
    if (!profiles.length) throw missing();
    return (
      '#EXTM3U\n#EXT-X-VERSION:3\n' +
      profiles
        .map(
          (profile) =>
            `#EXT-X-STREAM-INF:BANDWIDTH=${Math.ceil(profile.bitrate * 1.15)},RESOLUTION=${profile.width}x${profile.height}\n${mediaUrl(claim, profile.label, 'index.m3u8', String(token))}\n`,
        )
        .join('')
    );
  };
}

/** Variant playlist is rewritten to resolve every segment through a short-lived S3 redirect. */
/**
 * Put signed S3 GET URLs directly in the variant playlist. Using API 302 redirects
 * for XHR segment loads can turn the follow-up Origin into "null" in browsers.
 * The URLs are scoped to committed rendition keys and expire no later than
 * the playback capability. Long-running playback needs renewal (STREAM-006.6).
 */
export function createPlaybackVariantService(
  authorize: (videoId: string, token: unknown) => Promise<MediaClaim> = authorizeMediaClaim,
  storage?: PlaybackHlsStorage,
): PlaybackVariantHandler {
  return async (videoId, label, token) => {
    const claim = await authorize(videoId, token);
    const prefix = playbackPrefix(claim);
    const rendition = findRendition(claim, prefix, label);
    let text: string;
    try {
      text = await (storage ?? defaultStorage()).readVariant(rendition.playlistKey);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, 'HLS_PLAYLIST_UNAVAILABLE', 'HLS playlist is unavailable');
    }
    if (
      !text.startsWith('#EXTM3U') ||
      /(?:^|\n)#EXT-X-(?:KEY|MAP|BYTERANGE|PART|PRELOAD-HINT)/u.test(text) ||
      /URI\s*=/iu.test(text)
    ) {
      throw invalid();
    }

    // Validate every segment before signing any URL.
    const lines = text.split(/\r?\n/u);
    const segmentKeys: string[] = [];
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      if (!safeSegment.test(line)) throw invalid();
      segmentKeys.push(`${prefix}${label}/${line}`);
    }
    if (!segmentKeys.length || !text.includes('#EXT-X-ENDLIST')) throw invalid();

    const ttlSeconds = Math.min(900, claim.capability.exp - Math.floor(Date.now() / 1000));
    if (ttlSeconds <= 0) throw missing();
    const signer = storage ?? defaultStorage();
    const urls = await signHlsSegmentUrls(segmentKeys, (key) =>
      signer.signSegment(key, claim.config.mediaEndpoint, ttlSeconds),
    );
    let index = 0;
    return lines.map((line) => (!line || line.startsWith('#') ? line : urls[index++])).join('\n');
  };
}

/** Redirect at request time so VOD segments do not all expire when the manifest is fetched. */
export function createPlaybackSegmentService(
  authorize: (videoId: string, token: unknown) => Promise<MediaClaim> = authorizeMediaClaim,
  storage?: PlaybackHlsStorage,
): PlaybackSegmentHandler {
  return async (videoId, label, segment, token) => {
    if (!safeSegment.test(segment)) throw missing();
    const claim = await authorize(videoId, token);
    const prefix = playbackPrefix(claim);
    findRendition(claim, prefix, label);
    return (storage ?? defaultStorage()).signSegment(
      `${prefix}${label}/${segment}`,
      claim.config.mediaEndpoint,
    );
  };
}

export const getPlaybackMaster = createPlaybackMasterService();
// Lazily instantiate S3 clients: isolated authorization tests must not require MinIO config.
export const getPlaybackVariant = createPlaybackVariantService();
export const getPlaybackSegment = createPlaybackSegmentService();
