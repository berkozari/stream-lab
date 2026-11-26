import type { MultipartUploadService } from './services/upload-multipart.service.js';
import type { RefreshHandler } from './services/refresh.service.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { allowedOrigins } from './config/env.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createUserRouter } from './routes/user.routes.js';
import { createWatchProgressRouter } from './routes/watch-progress.routes.js';
import { createVideoRouter } from './routes/video.routes.js';
import { createCategoryRouter } from './routes/category.routes.js';
import { createCreatorRouter } from './routes/creator.routes.js';
import type { CreatorSummaryHandler } from './services/creator-summary.service.js';
import type { CreatorAnalyticsHandler } from './services/creator-analytics.service.js';
import type { AnalyticsHandler } from './services/playback-analytics.service.js';
import type { CategoryListHandler } from './services/category.service.js';
import { createUploadRouter } from './routes/upload.routes.js';
import type { CreateVideoHandler } from './services/video.service.js';
import type { VideoListHandler, VideoDetailHandler } from './services/video-read.service.js';
import type { PlaybackHandler } from './services/playback.service.js';
import type {
  PlaybackManifestHandler,
  PlaybackVariantHandler,
  PlaybackSegmentHandler,
} from './services/playback-hls.service.js';
import type { UpdateVideoHandler } from './services/video-update.service.js';
import type { DeleteVideoHandler } from './services/video-delete.service.js';
import type { CreateUploadSessionHandler } from './services/upload-session.service.js';
import type { SignUploadHandler } from './services/upload-sign.service.js';
import type { CompleteUploadHandler } from './services/upload-complete.service.js';
import type { LogoutHandler } from './services/session.service.js';
import type { RequestHandler } from 'express';
import type { RegisterHandler, LoginHandler } from './services/auth.service.js';
import { requestIdMiddleware } from './middlewares/request-id.middleware.js';
import { requestLoggerMiddleware } from './middlewares/request-logger.middleware.js';
import { notFoundMiddleware } from './middlewares/not-found.middleware.js';
import { errorMiddleware } from './middlewares/error.middleware.js';
import { AppError } from './utils/app-error.js';
import type { ReadinessReport } from './lib/readiness.js';

type AppOptions = {
  readiness?: () => Promise<ReadinessReport>;
  register?: RegisterHandler;
  login?: LoginHandler;
  refresh?: RefreshHandler;
  logout?: LogoutHandler;
  authenticate?: RequestHandler;
  videoCreate?: CreateVideoHandler;
  videoList?: VideoListHandler;
  categoryList?: CategoryListHandler;
  creatorSummary?: CreatorSummaryHandler;
  creatorAnalytics?: CreatorAnalyticsHandler;
  videoDetail?: VideoDetailHandler;
  videoPlayback?: PlaybackHandler;
  playbackAnalytics?: AnalyticsHandler;
  videoPlaybackMaster?: PlaybackManifestHandler;
  videoPlaybackVariant?: PlaybackVariantHandler;
  videoPlaybackSegment?: PlaybackSegmentHandler;
  videoUpdate?: UpdateVideoHandler;
  videoDelete?: DeleteVideoHandler;
  videoUploadCreate?: CreateUploadSessionHandler;
  uploadSign?: SignUploadHandler;
  uploadComplete?: CompleteUploadHandler;
  uploadMultipart?: MultipartUploadService;
  videoMultipartCreate?: MultipartUploadService['initiate'];
};

/** Configure Express without starting an HTTP listener (testable app factory). */
export function createApp(options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(requestLoggerMiddleware);
  app.use(requestIdMiddleware);
  app.use(
    cors({
      credentials: true,
      origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
          callback(null, true);
        } else {
          callback(new AppError(403, 'CORS_ORIGIN_DENIED', 'Origin is not allowed'));
        }
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use('/api/v1/health', createHealthRouter(options.readiness));
  app.use(
    '/api/v1/auth',
    createAuthRouter({
      register: options.register,
      login: options.login,
      refresh: options.refresh,
      logout: options.logout,
    }),
  );
  app.use('/api/v1/users', createUserRouter(options.authenticate));
  app.use('/api/v1/users/me', createWatchProgressRouter(options.authenticate));
  app.use('/api/v1/categories', createCategoryRouter(options.categoryList));
  app.use(
    '/api/v1/creator',
    createCreatorRouter(options.authenticate, options.creatorSummary, options.creatorAnalytics),
  );
  app.use(
    '/api/v1/videos',
    createVideoRouter({
      authenticate: options.authenticate,
      create: options.videoCreate,
      list: options.videoList,
      detail: options.videoDetail,
      playback: options.videoPlayback,
      playbackAnalytics: options.playbackAnalytics,
      playbackMaster: options.videoPlaybackMaster,
      playbackVariant: options.videoPlaybackVariant,
      playbackSegment: options.videoPlaybackSegment,
      update: options.videoUpdate,
      delete: options.videoDelete,
      uploadCreate: options.videoUploadCreate,
      multipartCreate: options.videoMultipartCreate,
    }),
  );
  app.use(
    '/api/v1/uploads',
    createUploadRouter({
      authenticate: options.authenticate,
      sign: options.uploadSign,
      complete: options.uploadComplete,
      multipart: options.uploadMultipart,
    }),
  );
  app.use(notFoundMiddleware);
  app.use(errorMiddleware);
  return app;
}
