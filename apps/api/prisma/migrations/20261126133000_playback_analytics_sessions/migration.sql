-- Persist one bounded playback session per client-generated UUID.
-- No IP address, access token, signed capability or raw event stream is stored.
CREATE TABLE "PlaybackAnalyticsSession" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "viewerId" UUID,
    "processingVersion" INTEGER NOT NULL,
    "lastSequence" INTEGER NOT NULL DEFAULT -1,
    "lastPositionSeconds" INTEGER NOT NULL DEFAULT 0,
    "watchedSeconds" INTEGER NOT NULL DEFAULT 0,
    "qualifiedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastEventAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "PlaybackAnalyticsSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PlaybackAnalyticsSession_videoId_qualifiedAt_idx" ON "PlaybackAnalyticsSession"("videoId", "qualifiedAt");
CREATE INDEX "PlaybackAnalyticsSession_videoId_startedAt_idx" ON "PlaybackAnalyticsSession"("videoId", "startedAt");
CREATE INDEX "PlaybackAnalyticsSession_viewerId_startedAt_idx" ON "PlaybackAnalyticsSession"("viewerId", "startedAt");
ALTER TABLE "PlaybackAnalyticsSession" ADD CONSTRAINT "PlaybackAnalyticsSession_videoId_fkey"
  FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PlaybackAnalyticsSession" ADD CONSTRAINT "PlaybackAnalyticsSession_viewerId_fkey"
  FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
