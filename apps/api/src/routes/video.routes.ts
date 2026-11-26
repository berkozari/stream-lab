import type { MultipartUploadService } from '../services/upload-multipart.service.js';
import { multipartCreateController } from '../controllers/upload-multipart.controller.js';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import {
  CreateVideoRequestSchema,
  UpdateVideoRequestSchema,
  PlaybackAnalyticsEventSchema,
} from '@streamlab/contracts';
import {
  CreateUploadRequestSchema,
  CreateMultipartUploadRequestSchema,
} from '@streamlab/contracts';
import { createCreateVideoController } from '../controllers/video.controller.js';
import { createUpdateVideoController } from '../controllers/video-update.controller.js';
import { createDeleteVideoController } from '../controllers/video-delete.controller.js';
import { createUploadSessionController } from '../controllers/upload-session.controller.js';
import {
  createListVideoController,
  createVideoDetailController,
} from '../controllers/video-read.controller.js';
import { requireAuth } from '../middlewares/auth.middleware.js';
import {
  playbackHeaders,
  createPlaybackController,
  createPlaybackMasterController,
  createPlaybackVariantController,
  createPlaybackSegmentController,
} from '../controllers/playback.controller.js';
import type { PlaybackHandler } from '../services/playback.service.js';
import type {
  PlaybackManifestHandler,
  PlaybackVariantHandler,
  PlaybackSegmentHandler,
} from '../services/playback-hls.service.js';
import { validateBody } from '../middlewares/validate.middleware.js';
import { createPlaybackAnalyticsController } from '../controllers/playback-analytics.controller.js';
import type { AnalyticsHandler } from '../services/playback-analytics.service.js';
import type { CreateVideoHandler } from '../services/video.service.js';
import type { UpdateVideoHandler } from '../services/video-update.service.js';
import type { DeleteVideoHandler } from '../services/video-delete.service.js';
import type { CreateUploadSessionHandler } from '../services/upload-session.service.js';
import type { VideoListHandler, VideoDetailHandler } from '../services/video-read.service.js';

export type VideoRouterOptions = {
  multipartCreate?: MultipartUploadService['initiate'];
  authenticate?: RequestHandler;
  create?: CreateVideoHandler;
  list?: VideoListHandler;
  detail?: VideoDetailHandler;
  update?: UpdateVideoHandler;
  delete?: DeleteVideoHandler;
  uploadCreate?: CreateUploadSessionHandler;
  playback?: PlaybackHandler;
  playbackAnalytics?: AnalyticsHandler;
  playbackMaster?: PlaybackManifestHandler;
  playbackVariant?: PlaybackVariantHandler;
  playbackSegment?: PlaybackSegmentHandler;
};

export function createVideoRouter(options: VideoRouterOptions = {}): Router {
  const router = Router();
  // HLS manifests are fetched across origins by the video player.
  // Keep Helmet's default CORP policy for all other API routes.
  router.use('/:videoId/playback/hls', (_req, res, next) => {
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  const authenticate = options.authenticate ?? requireAuth;
  const optionalAuthentication: RequestHandler = (req, res, next) => {
    if (req.get('authorization') === undefined) {
      next();
      return;
    }
    authenticate(req, res, next);
  };
  router.get('/', createListVideoController('public', options.list));
  router.get('/mine', authenticate, createListVideoController('mine', options.list));
  router.get('/:videoId', optionalAuthentication, createVideoDetailController(options.detail));
  router.get(
    '/:videoId/playback',
    playbackHeaders,
    optionalAuthentication,
    createPlaybackController(options.playback),
  );
  router.get(
    '/:videoId/playback/hls/master.m3u8',
    playbackHeaders,
    createPlaybackMasterController(options.playbackMaster),
  );
  router.get(
    '/:videoId/playback/hls/:label/index.m3u8',
    playbackHeaders,
    createPlaybackVariantController(options.playbackVariant),
  );
  router.get(
    '/:videoId/playback/hls/:label/:segment',
    playbackHeaders,
    createPlaybackSegmentController(options.playbackSegment),
  );
  // Access JWT + active PostgreSQL session; this route does not use cookie authentication.
  // Capability token in the validated body; never use query strings for analytics writes.
  // Per-process IP limiter is a basic traffic guard, not bot/fraud protection.
  router.post(
    '/:videoId/analytics/events',
    rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }),
    (_req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      res.set('Referrer-Policy', 'no-referrer');
      next();
    },
    validateBody(PlaybackAnalyticsEventSchema),
    createPlaybackAnalyticsController(options.playbackAnalytics),
  );
  router.post(
    '/',
    authenticate,
    validateBody(CreateVideoRequestSchema),
    createCreateVideoController(options.create),
  );
  router.patch(
    '/:videoId',
    authenticate,
    validateBody(UpdateVideoRequestSchema),
    createUpdateVideoController(options.update),
  );
  router.post(
    '/:videoId/uploads',
    authenticate,
    validateBody(CreateUploadRequestSchema),
    createUploadSessionController(options.uploadCreate),
  );
  router.delete('/:videoId', authenticate, createDeleteVideoController(options.delete));
  router.post(
    '/:videoId/uploads/multipart',
    authenticate,
    validateBody(CreateMultipartUploadRequestSchema),
    multipartCreateController(
      options.multipartCreate ? { initiate: options.multipartCreate } : undefined,
    ),
  );
  return router;
}
