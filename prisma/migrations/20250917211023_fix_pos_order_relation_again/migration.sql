/*
  Warnings:

  - You are about to drop the column `posOrderId` on the `WalletTransaction` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "public"."WalletTransaction_posOrderId_key";

-- AlterTable
ALTER TABLE "public"."WalletTransaction" DROP COLUMN "posOrderId";
