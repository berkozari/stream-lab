-- STREAM-009.4: all-time anonymous aggregates survive bounded session retention.
-- Existing playback rows remain untouched when this migration is deployed.
CREATE TABLE "VideoAnalyticsArchive" (
    "videoId" UUID NOT NULL,
    "qualifiedViews" BIGINT NOT NULL DEFAULT 0,
    "watchSeconds" BIGINT NOT NULL DEFAULT 0,
    "completedViews" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "VideoAnalyticsArchive_pkey" PRIMARY KEY ("videoId")
);
ALTER TABLE "VideoAnalyticsArchive"
    ADD CONSTRAINT "VideoAnalyticsArchive_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Supports limited, oldest-first retention batches with SKIP LOCKED.
CREATE INDEX "PlaybackAnalyticsSession_lastEventAt_id_idx"
    ON "PlaybackAnalyticsSession"("lastEventAt", "id");
