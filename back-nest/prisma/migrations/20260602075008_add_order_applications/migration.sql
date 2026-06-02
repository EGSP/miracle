-- CreateTable
CREATE TABLE "order_applications" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "order_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_applications_orderId_idx" ON "order_applications"("orderId");
