-- CreateEnum
CREATE TYPE "LlmUsageStatus" AS ENUM ('submitted', 'completed', 'failed');

-- CreateTable
CREATE TABLE "llm_usage_records" (
    "id" TEXT NOT NULL,
    "responseId" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "LlmUsageStatus" NOT NULL DEFAULT 'submitted',
    "tags" JSONB NOT NULL DEFAULT '{}',
    "estimatedInputTokens" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "totalTokens" INTEGER,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "llm_usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "llm_usage_records_responseId_key" ON "llm_usage_records"("responseId");

-- CreateIndex
CREATE INDEX "llm_usage_records_createdAt_idx" ON "llm_usage_records"("createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_records_status_idx" ON "llm_usage_records"("status");
