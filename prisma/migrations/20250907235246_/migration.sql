-- AlterTable
ALTER TABLE "public"."Student" ADD COLUMN     "daily_spending_limit" DECIMAL(12,2),
ADD COLUMN     "is_nfc_active" BOOLEAN NOT NULL DEFAULT true;
