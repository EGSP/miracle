-- Вынос условного обозначения в отдельную таблицу designations (1:1 с позицией по orderPositionId).
-- CreateTable
CREATE TABLE "designations" (
    "id" TEXT NOT NULL,
    "orderPositionId" TEXT NOT NULL,
    "tcId" TEXT NOT NULL,
    "values" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "designations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "designations_orderPositionId_key" ON "designations"("orderPositionId");
