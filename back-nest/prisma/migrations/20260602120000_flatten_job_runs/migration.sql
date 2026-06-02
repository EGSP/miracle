-- AlterTable
ALTER TABLE "job_runs" DROP COLUMN "cursor",
DROP COLUMN "steps",
ADD COLUMN     "key" TEXT,
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "job_runs_parentId_idx" ON "job_runs"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_parentId_key_key" ON "job_runs"("parentId", "key");
