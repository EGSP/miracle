-- CreateTable
CREATE TABLE "order_positions" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "productTypeId" TEXT,
    "productTypeName" TEXT,
    "requirements" JSONB,
    "designation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "order_positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_positions_applicationId_idx" ON "order_positions"("applicationId");
