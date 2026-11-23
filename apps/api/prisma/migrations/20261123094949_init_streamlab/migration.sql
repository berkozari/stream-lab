-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'UPLOADING', 'UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED', 'DELETING');

-- CreateEnum
CREATE TYPE "VideoVisibility" AS ENUM ('PRIVATE', 'UNLISTED', 'PUBLIC');

-- CreateEnum
CREATE TYPE "UploadStatus" AS ENUM ('INITIATED', 'UPLOADING', 'VERIFIED', 'FAILED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UploadMode" AS ENUM ('SINGLE', 'MULTIPART');

-- CreateEnum
CREATE TYPE "MediaAssetKind" AS ENUM ('ORIGINAL', 'THUMBNAIL', 'HLS_MASTER');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" VARCHAR(100) NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "avatarKey" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" VARCHAR(128) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Video" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "VideoVisibility" NOT NULL DEFAULT 'PRIVATE',
    "processingVersion" INTEGER NOT NULL DEFAULT 0,
    "durationSeconds" INTEGER,
    "publishedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoUpload" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "UploadStatus" NOT NULL DEFAULT 'INITIATED',
    "uploadMode" "UploadMode" NOT NULL DEFAULT 'SINGLE',
    "storageUploadId" TEXT,
    "expectedSizeBytes" BIGINT NOT NULL,
    "checksum" VARCHAR(255),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "kind" "MediaAssetKind" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" VARCHAR(255) NOT NULL,
    "sizeBytes" BIGINT,
    "processingVersion" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoRendition" (
    "id" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "processingVersion" INTEGER NOT NULL,
    "label" VARCHAR(20) NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bitrate" INTEGER NOT NULL,
    "codec" VARCHAR(64) NOT NULL,
    "playlistKey" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoRendition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "slug" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoCategory" (
    "videoId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,

    CONSTRAINT "VideoCategory_pkey" PRIMARY KEY ("videoId","categoryId")
);

-- CreateTable
CREATE TABLE "WatchProgress" (
    "userId" UUID NOT NULL,
    "videoId" UUID NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(3),
    "lastWatchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WatchProgress_pkey" PRIMARY KEY ("userId","videoId")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_refreshTokenHash_key" ON "AuthSession"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Video_ownerId_createdAt_idx" ON "Video"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "Video_status_visibility_deletedAt_publishedAt_idx" ON "Video"("status", "visibility", "deletedAt", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoUpload_storageKey_key" ON "VideoUpload"("storageKey");

-- CreateIndex
CREATE INDEX "VideoUpload_videoId_status_idx" ON "VideoUpload"("videoId", "status");

-- CreateIndex
CREATE INDEX "VideoUpload_expiresAt_status_idx" ON "VideoUpload"("expiresAt", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_videoId_kind_idx" ON "MediaAsset"("videoId", "kind");

-- CreateIndex
CREATE INDEX "MediaAsset_videoId_processingVersion_idx" ON "MediaAsset"("videoId", "processingVersion");

-- CreateIndex
CREATE UNIQUE INDEX "VideoRendition_playlistKey_key" ON "VideoRendition"("playlistKey");

-- CreateIndex
CREATE INDEX "VideoRendition_videoId_processingVersion_idx" ON "VideoRendition"("videoId", "processingVersion");

-- CreateIndex
CREATE UNIQUE INDEX "VideoRendition_videoId_processingVersion_label_key" ON "VideoRendition"("videoId", "processingVersion", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE INDEX "VideoCategory_categoryId_videoId_idx" ON "VideoCategory"("categoryId", "videoId");

-- CreateIndex
CREATE INDEX "WatchProgress_userId_lastWatchedAt_idx" ON "WatchProgress"("userId", "lastWatchedAt");

-- AddForeignKey
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoUpload" ADD CONSTRAINT "VideoUpload_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRendition" ADD CONSTRAINT "VideoRendition_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCategory" ADD CONSTRAINT "VideoCategory_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoCategory" ADD CONSTRAINT "VideoCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchProgress" ADD CONSTRAINT "WatchProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchProgress" ADD CONSTRAINT "WatchProgress_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "Video"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
