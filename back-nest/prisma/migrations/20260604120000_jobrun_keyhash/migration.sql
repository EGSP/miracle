-- Перевод идентичности прогонов на глобальный keyHash (ключ-массив в стиле TanStack Query).
-- Прежняя пара (parentId, key) больше не определяет идентичность; parentId остаётся навигацией.

-- DropIndex (старая уникальность (parentId, key))
DROP INDEX "job_runs_parentId_key_key";

-- AlterColumn: key из TEXT в JSONB (структурный ключ-массив)
ALTER TABLE "job_runs" ALTER COLUMN "key" TYPE JSONB USING to_jsonb("key");

-- AddColumn keyHash + бэкфилл существующих строк (id уникален) + NOT NULL
ALTER TABLE "job_runs" ADD COLUMN "keyHash" TEXT;
UPDATE "job_runs" SET "keyHash" = "id";
ALTER TABLE "job_runs" ALTER COLUMN "keyHash" SET NOT NULL;

-- CreateIndex (новая глобальная уникальность по keyHash)
CREATE UNIQUE INDEX "job_runs_keyHash_key" ON "job_runs"("keyHash");
