/*
  Warnings:

  - You are about to drop the column `details` on the `orders` table. All the data in the column will be lost.
  - You are about to drop the column `fileId` on the `orders` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "orders" DROP COLUMN "details",
DROP COLUMN "fileId";
