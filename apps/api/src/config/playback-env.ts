import './env.js'; // Load the existing root .env file, without booting storage.

export type PlaybackConfig = {
  secret: string;
  publicBaseUrl: string;
  mediaEndpoint: string;
  ttlSeconds: number;
};

function bareHttpOrigin(value: string, label: string, production: boolean): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) origin`);
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    (production && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error(`${label} must be a bare HTTP(S) origin${production ? ' with HTTPS' : ''}`);
  }
  return url.origin;
}

/** Media playback is a separate bearer capability, never the access JWT. */
export function readPlaybackConfig(source: NodeJS.ProcessEnv = process.env): PlaybackConfig {
  const production = source.NODE_ENV === 'production';
  const secret = source.PLAYBACK_SIGNING_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('PLAYBACK_SIGNING_SECRET must be at least 32 bytes');
  }
  const rawTtl = source.PLAYBACK_TOKEN_TTL_SECONDS ?? '900';
  const ttlSeconds = Number(rawTtl);
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 3600) {
    throw new Error('PLAYBACK_TOKEN_TTL_SECONDS must be an integer between 60 and 3600');
  }
  if (production && (!source.PLAYBACK_PUBLIC_BASE_URL || !source.PLAYBACK_S3_PUBLIC_ENDPOINT)) {
    throw new Error('Production requires PLAYBACK_PUBLIC_BASE_URL and PLAYBACK_S3_PUBLIC_ENDPOINT');
  }
  return {
    secret,
    ttlSeconds,
    publicBaseUrl: bareHttpOrigin(
      source.PLAYBACK_PUBLIC_BASE_URL ?? `http://localhost:${source.PORT || '4000'}`,
      'PLAYBACK_PUBLIC_BASE_URL',
      production,
    ),
    mediaEndpoint: bareHttpOrigin(
      source.PLAYBACK_S3_PUBLIC_ENDPOINT ?? source.S3_ENDPOINT ?? 'http://127.0.0.1:9000',
      'PLAYBACK_S3_PUBLIC_ENDPOINT',
      production,
    ),
  };
}
