-- CreateEnum
CREATE TYPE "EnrichmentBatchStatus" AS ENUM ('SUBMITTED', 'COLLECTED');

-- CreateTable
CREATE TABLE "EnrichmentBatch" (
    "id" TEXT NOT NULL,
    "anthropicBatchId" TEXT NOT NULL,
    "status" "EnrichmentBatchStatus" NOT NULL DEFAULT 'SUBMITTED',
    "bookIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "EnrichmentBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EnrichmentBatch_anthropicBatchId_key" ON "EnrichmentBatch"("anthropicBatchId");

-- CreateIndex
CREATE INDEX "EnrichmentBatch_status_idx" ON "EnrichmentBatch"("status");

-- Row-level security, so Supabase's Data API can't expose the table.
ALTER TABLE "EnrichmentBatch" ENABLE ROW LEVEL SECURITY;
