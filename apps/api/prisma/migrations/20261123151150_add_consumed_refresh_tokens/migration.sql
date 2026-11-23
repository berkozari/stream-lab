-- CreateTable
CREATE TABLE "ConsumedRefreshToken" (
    "tokenHash" VARCHAR(128) NOT NULL,
    "sessionId" UUID NOT NULL,
    "consumedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumedRefreshToken_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateIndex
CREATE INDEX "ConsumedRefreshToken_sessionId_idx" ON "ConsumedRefreshToken"("sessionId");

-- AddForeignKey
ALTER TABLE "ConsumedRefreshToken" ADD CONSTRAINT "ConsumedRefreshToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
