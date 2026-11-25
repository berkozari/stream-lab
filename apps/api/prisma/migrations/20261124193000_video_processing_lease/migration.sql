-- Transcoding claims are fenced by a per-claim token, not merely a video version.
-- Expired leases can be reclaimed after a worker crash; heartbeats renew long jobs.
ALTER TABLE "Video"
  ADD COLUMN "processingLeaseToken" UUID,
  ADD COLUMN "processingLeaseExpiresAt" TIMESTAMPTZ(3);
