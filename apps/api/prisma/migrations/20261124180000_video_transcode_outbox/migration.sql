-- STREAM-005.2B: transactional outbox for durable, versioned transcoding dispatch.
CREATE TYPE "TranscodeDispatchStatus" AS ENUM ('PENDING', 'DISPATCHING', 'DISPATCHED', 'CANCELLED');

CREATE TABLE "VideoTranscodeOutbox" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "processingVersion" INTEGER NOT NULL,
    "jobId" VARCHAR(160) NOT NULL,
    "status" "TranscodeDispatchStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" UUID,
    "leaseExpiresAt" TIMESTAMPTZ(3),
    "dispatchedAt" TIMESTAMPTZ(3),
    "lastErrorCode" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "VideoTranscodeOutbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VideoTranscodeOutbox_jobId_key" ON "VideoTranscodeOutbox"("jobId");
CREATE UNIQUE INDEX "VideoTranscodeOutbox_videoId_processingVersion_key" ON "VideoTranscodeOutbox"("videoId", "processingVersion");
CREATE INDEX "VideoTranscodeOutbox_status_nextAttemptAt_idx" ON "VideoTranscodeOutbox"("status", "nextAttemptAt");
CREATE INDEX "VideoTranscodeOutbox_status_leaseExpiresAt_idx" ON "VideoTranscodeOutbox"("status", "leaseExpiresAt");
ALTER TABLE "VideoTranscodeOutbox" ADD CONSTRAINT "VideoTranscodeOutbox_videoId_fkey"
    FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
