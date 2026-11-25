import type { RequestHandler } from 'express';
import { IdSchema } from '@streamlab/contracts';
import { AppError } from '../utils/app-error.js';
import { sendSuccess } from '../utils/api-response.js';
import { getVideoPlayback, type PlaybackHandler } from '../services/playback.service.js';
import {
  getPlaybackMaster,
  getPlaybackVariant,
  getPlaybackSegment,
  type PlaybackManifestHandler,
  type PlaybackVariantHandler,
  type PlaybackSegmentHandler,
} from '../services/playback-hls.service.js';

function videoIdParam(value: unknown): string {
  const id = IdSchema.safeParse(value);
  if (!id.success) {
    throw new AppError(422, 'VALIDATION_ERROR', 'Invalid video ID');
  }
  return id.data;
}

const secureHeaders: RequestHandler = (_req, res, next) => {
  res.set('Cache-Control', 'private, no-store');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Content-Type-Options', 'nosniff');
  next();
};

function tokenParam(value: unknown): string {
  if (typeof value !== 'string') throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
  return value;
}

export const playbackHeaders = secureHeaders;

export function createPlaybackController(
  handler: PlaybackHandler = getVideoPlayback,
): RequestHandler {
  return async (req, res) => {
    const viewer = req.auth ? { userId: req.auth.userId, role: req.auth.user.role } : undefined;
    const result = await handler(videoIdParam(req.params.videoId), viewer);
    sendSuccess(res, result);
  };
}

export function createPlaybackMasterController(
  handler: PlaybackManifestHandler = getPlaybackMaster,
): RequestHandler {
  return async (req, res) => {
    const body = await handler(videoIdParam(req.params.videoId), tokenParam(req.query.token));
    res.type('application/vnd.apple.mpegurl').send(body);
  };
}

export function createPlaybackVariantController(
  handler: PlaybackVariantHandler = getPlaybackVariant,
): RequestHandler {
  return async (req, res) => {
    const label = req.params.label;
    if (typeof label !== 'string') throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
    const body = await handler(
      videoIdParam(req.params.videoId),
      label,
      tokenParam(req.query.token),
    );
    res.type('application/vnd.apple.mpegurl').send(body);
  };
}

export function createPlaybackSegmentController(
  handler: PlaybackSegmentHandler = getPlaybackSegment,
): RequestHandler {
  return async (req, res) => {
    const label = req.params.label;
    const segment = req.params.segment;
    if (typeof label !== 'string' || typeof segment !== 'string') {
      throw new AppError(404, 'MEDIA_NOT_FOUND', 'Media not found');
    }
    const url = await handler(
      videoIdParam(req.params.videoId),
      label,
      segment,
      tokenParam(req.query.token),
    );
    res.redirect(302, url);
  };
}
