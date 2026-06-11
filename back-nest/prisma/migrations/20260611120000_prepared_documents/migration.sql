-- CreateEnum
CREATE TYPE "PrepareStatus" AS ENUM ('queued', 'running', 'succeeded', 'failed');

-- CreateTable
CREATE TABLE "prepared_documents" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "status" "PrepareStatus" NOT NULL,
    "engine" TEXT NOT NULL,
    "markdown" TEXT,
    "pages" JSONB,
    "meta" JSONB,
    "error" TEXT,
    "jobRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "prepared_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prepared_documents_fileId_idx" ON "prepared_documents"("fileId");

-- CreateIndex
CREATE INDEX "prepared_documents_status_idx" ON "prepared_documents"("status");

-- CreateIndex
CREATE INDEX "prepared_documents_fileId_status_idx" ON "prepared_documents"("fileId", "status");

-- AddForeignKey
ALTER TABLE "prepared_documents" ADD CONSTRAINT "prepared_documents_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
