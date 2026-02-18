-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "twoFactorCode" TEXT,
ADD COLUMN     "twoFactorCodeExpires" TIMESTAMP(3);
