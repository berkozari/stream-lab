import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError } from '../utils/app-error.js';

export type PlaybackCapability = {
  v: 1;
  videoId: string;
  processingVersion: number;
  exp: number;
  viewerId: string | null;
  viewerRole: 'USER' | 'ADMIN' | null;
};

const notFound = () => new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

export function signPlaybackCapability(input: PlaybackCapability, secret: string): string {
  const body = Buffer.from(JSON.stringify(input)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`streamlab-playback-v1.${body}`)
    .digest('base64url');
  return `${body}.${signature}`;
}

/** Fixed-purpose, short-lived HMAC token; fail closed on malformed/expired content. */
export function verifyPlaybackCapability(
  token: unknown,
  secret: string,
  nowMs = Date.now(),
): PlaybackCapability {
  if (
    typeof token !== 'string' ||
    token.length > 2048 ||
    !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)
  ) {
    throw notFound();
  }
  const [body, signature] = token.split('.');
  if (!body || !signature) throw notFound();
  const digest = createHmac('sha256', secret).update(`streamlab-playback-v1.${body}`).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== digest.length || !timingSafeEqual(digest, supplied)) throw notFound();
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as unknown;
  } catch {
    throw notFound();
  }
  if (!value || typeof value !== 'object') throw notFound();
  const claim = value as Record<string, unknown>;
  if (
    claim.v !== 1 ||
    typeof claim.videoId !== 'string' ||
    !uuid.test(claim.videoId) ||
    !Number.isSafeInteger(claim.processingVersion) ||
    (claim.processingVersion as number) < 1 ||
    !Number.isSafeInteger(claim.exp) ||
    (claim.exp as number) <= Math.floor(nowMs / 1000) ||
    !(
      claim.viewerId === null ||
      (typeof claim.viewerId === 'string' && uuid.test(claim.viewerId))
    ) ||
    !(claim.viewerRole === null || claim.viewerRole === 'USER' || claim.viewerRole === 'ADMIN')
  ) {
    throw notFound();
  }
  return {
    v: 1,
    videoId: claim.videoId as string,
    processingVersion: claim.processingVersion as number,
    exp: claim.exp as number,
    viewerId: claim.viewerId as string | null,
    viewerRole: claim.viewerRole as 'USER' | 'ADMIN' | null,
  };
}
