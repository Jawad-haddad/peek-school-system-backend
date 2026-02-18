/*
  Warnings:

  - The values [PRESENT,ABSENT,LATE,EXCUSED] on the enum `AttendanceStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [DRAFT,OPEN,PARTIALLY_PAID,PAID,VOID] on the enum `InvoiceStatus` will be removed. If these variants are still used in the database, this will fail.
  - The values [CASH,CARD,BANK_TRANSFER,WALLET,ONLINE_GATEWAY] on the enum `PaymentMethod` will be removed. If these variants are still used in the database, this will fail.
  - The values [MORNING,AFTERNOON] on the enum `TripDirection` will be removed. If these variants are still used in the database, this will fail.
  - The values [TOPUP,PURCHASE,REFUND,ADJUSTMENT] on the enum `WalletTxnType` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `academicYearId` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `classId` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `CanteenItem` table. All the data in the column will be lost.
  - You are about to drop the column `isActive` on the `CanteenItem` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `Class` table. All the data in the column will be lost.
  - You are about to drop the column `academicYearId` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `maxScore` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `recordedAt` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `score` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `subjectId` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `memo` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `Invoice` table. All the data in the column will be lost.
  - You are about to drop the column `orderedByUserId` on the `POSOrder` table. All the data in the column will be lost.
  - You are about to drop the column `walletTransactionId` on the `POSOrder` table. All the data in the column will be lost.
  - The `status` column on the `POSOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `canteenItemId` on the `POSOrderItem` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `externalRef` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `studentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `schoolId` on the `StudentEnrollment` table. All the data in the column will be lost.
  - You are about to drop the column `academicYearId` on the `Subject` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[academicYearId,name]` on the table `Class` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[studentId,homeworkId]` on the table `Grade` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[walletTxnId]` on the table `POSOrder` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[walletTxnId]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[name]` on the table `School` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[passwordResetToken]` on the table `User` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[paymentId]` on the table `WalletTransaction` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `category` to the `CanteenItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `grade` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `homeworkId` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `feeStructureId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Made the column `studentId` on table `POSOrder` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `itemId` to the `POSOrderItem` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lineTotal` to the `POSOrderItem` table without a default value. This is not possible if the table is not empty.
  - Made the column `invoiceId` on table `Payment` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "public"."POSOrderStatus" AS ENUM ('completed', 'refunded');

-- AlterEnum
BEGIN;
CREATE TYPE "public"."AttendanceStatus_new" AS ENUM ('present', 'absent', 'late', 'excused');
ALTER TABLE "public"."Attendance" ALTER COLUMN "status" TYPE "public"."AttendanceStatus_new" USING ("status"::text::"public"."AttendanceStatus_new");
ALTER TYPE "public"."AttendanceStatus" RENAME TO "AttendanceStatus_old";
ALTER TYPE "public"."AttendanceStatus_new" RENAME TO "AttendanceStatus";
DROP TYPE "public"."AttendanceStatus_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "public"."InvoiceStatus_new" AS ENUM ('draft', 'issued', 'partial', 'paid', 'overdue', 'cancelled');
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" TYPE "public"."InvoiceStatus_new" USING ("status"::text::"public"."InvoiceStatus_new");
ALTER TYPE "public"."InvoiceStatus" RENAME TO "InvoiceStatus_old";
ALTER TYPE "public"."InvoiceStatus_new" RENAME TO "InvoiceStatus";
DROP TYPE "public"."InvoiceStatus_old";
ALTER TABLE "public"."Invoice" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "public"."PaymentMethod_new" AS ENUM ('card', 'bank_transfer', 'cliq', 'efawateercom', 'cash', 'wallet');
ALTER TABLE "public"."Payment" ALTER COLUMN "method" TYPE "public"."PaymentMethod_new" USING ("method"::text::"public"."PaymentMethod_new");
ALTER TYPE "public"."PaymentMethod" RENAME TO "PaymentMethod_old";
ALTER TYPE "public"."PaymentMethod_new" RENAME TO "PaymentMethod";
DROP TYPE "public"."PaymentMethod_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "public"."TripDirection_new" AS ENUM ('pickup', 'dropoff');
ALTER TABLE "public"."BusTrip" ALTER COLUMN "direction" TYPE "public"."TripDirection_new" USING ("direction"::text::"public"."TripDirection_new");
ALTER TYPE "public"."TripDirection" RENAME TO "TripDirection_old";
ALTER TYPE "public"."TripDirection_new" RENAME TO "TripDirection";
DROP TYPE "public"."TripDirection_old";
COMMIT;

-- AlterEnum
ALTER TYPE "public"."UserRole" ADD VALUE 'bus_supervisor';

-- AlterEnum
BEGIN;
CREATE TYPE "public"."WalletTxnType_new" AS ENUM ('topup', 'purchase', 'refund', 'adjustment');
ALTER TABLE "public"."WalletTransaction" ALTER COLUMN "type" TYPE "public"."WalletTxnType_new" USING ("type"::text::"public"."WalletTxnType_new");
ALTER TYPE "public"."WalletTxnType" RENAME TO "WalletTxnType_old";
ALTER TYPE "public"."WalletTxnType_new" RENAME TO "WalletTxnType";
DROP TYPE "public"."WalletTxnType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "public"."Attendance" DROP CONSTRAINT "Attendance_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attendance" DROP CONSTRAINT "Attendance_classId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attendance" DROP CONSTRAINT "Attendance_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Class" DROP CONSTRAINT "Class_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Grade" DROP CONSTRAINT "Grade_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Grade" DROP CONSTRAINT "Grade_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Grade" DROP CONSTRAINT "Grade_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."POSOrder" DROP CONSTRAINT "POSOrder_orderedByUserId_fkey";

-- DropForeignKey
ALTER TABLE "public"."POSOrder" DROP CONSTRAINT "POSOrder_studentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."POSOrder" DROP CONSTRAINT "POSOrder_walletTransactionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."POSOrderItem" DROP CONSTRAINT "POSOrderItem_canteenItemId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_studentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StudentEnrollment" DROP CONSTRAINT "StudentEnrollment_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Subject" DROP CONSTRAINT "Subject_academicYearId_fkey";

-- DropIndex
DROP INDEX "public"."Attendance_schoolId_classId_date_idx";

-- DropIndex
DROP INDEX "public"."CanteenItem_schoolId_isActive_idx";

-- DropIndex
DROP INDEX "public"."Class_schoolId_academicYearId_idx";

-- DropIndex
DROP INDEX "public"."Class_schoolId_academicYearId_name_key";

-- DropIndex
DROP INDEX "public"."Grade_schoolId_subjectId_idx";

-- DropIndex
DROP INDEX "public"."Invoice_schoolId_studentId_idx";

-- DropIndex
DROP INDEX "public"."POSOrder_schoolId_status_idx";

-- DropIndex
DROP INDEX "public"."POSOrder_studentId_idx";

-- DropIndex
DROP INDEX "public"."POSOrder_walletTransactionId_key";

-- DropIndex
DROP INDEX "public"."Payment_schoolId_invoiceId_idx";

-- DropIndex
DROP INDEX "public"."School_name_idx";

-- DropIndex
DROP INDEX "public"."User_schoolId_idx";

-- DropIndex
DROP INDEX "public"."WalletTransaction_schoolId_studentId_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."AcademicYear" ALTER COLUMN "isActive" SET DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Attendance" DROP COLUMN "academicYearId",
DROP COLUMN "classId",
DROP COLUMN "schoolId",
ADD COLUMN     "reason" TEXT;

-- AlterTable
ALTER TABLE "public"."CanteenItem" DROP COLUMN "createdAt",
DROP COLUMN "isActive",
ADD COLUMN     "category" TEXT NOT NULL,
ADD COLUMN     "isAvailable" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "public"."Class" DROP COLUMN "schoolId";

-- AlterTable
ALTER TABLE "public"."Grade" DROP COLUMN "academicYearId",
DROP COLUMN "maxScore",
DROP COLUMN "recordedAt",
DROP COLUMN "schoolId",
DROP COLUMN "score",
DROP COLUMN "subjectId",
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "grade" DECIMAL(5,2) NOT NULL,
ADD COLUMN     "homeworkId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Invoice" DROP COLUMN "memo",
DROP COLUMN "schoolId",
ADD COLUMN     "feeStructureId" TEXT NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'draft';

-- AlterTable
ALTER TABLE "public"."POSOrder" DROP COLUMN "orderedByUserId",
DROP COLUMN "walletTransactionId",
ADD COLUMN     "paidByWallet" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "walletTxnId" TEXT,
ALTER COLUMN "studentId" SET NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."POSOrderStatus" NOT NULL DEFAULT 'completed';

-- AlterTable
ALTER TABLE "public"."POSOrderItem" DROP COLUMN "canteenItemId",
ADD COLUMN     "itemId" TEXT NOT NULL,
ADD COLUMN     "lineTotal" DECIMAL(12,2) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Payment" DROP COLUMN "createdAt",
DROP COLUMN "externalRef",
DROP COLUMN "schoolId",
DROP COLUMN "studentId",
ADD COLUMN     "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "transactionId" TEXT,
ADD COLUMN     "walletTxnId" TEXT,
ALTER COLUMN "invoiceId" SET NOT NULL;

-- AlterTable
ALTER TABLE "public"."StudentEnrollment" DROP COLUMN "schoolId";

-- AlterTable
ALTER TABLE "public"."Subject" DROP COLUMN "academicYearId";

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "updatedAt",
ADD COLUMN     "passwordResetExpires" TIMESTAMP(3),
ADD COLUMN     "passwordResetToken" TEXT;

-- DropEnum
DROP TYPE "public"."OrderStatus";

-- CreateTable
CREATE TABLE "public"."TeacherSubjectAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "classId" TEXT NOT NULL,

    CONSTRAINT "TeacherSubjectAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Homework" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,

    CONSTRAINT "Homework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeeStructure" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "academicYearId" TEXT NOT NULL,

    CONSTRAINT "FeeStructure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FeeItem" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "feeStructureId" TEXT NOT NULL,

    CONSTRAINT "FeeItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeacherSubjectAssignment_teacherId_idx" ON "public"."TeacherSubjectAssignment"("teacherId");

-- CreateIndex
CREATE INDEX "TeacherSubjectAssignment_subjectId_idx" ON "public"."TeacherSubjectAssignment"("subjectId");

-- CreateIndex
CREATE INDEX "TeacherSubjectAssignment_classId_idx" ON "public"."TeacherSubjectAssignment"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherSubjectAssignment_teacherId_subjectId_classId_key" ON "public"."TeacherSubjectAssignment"("teacherId", "subjectId", "classId");

-- CreateIndex
CREATE INDEX "Homework_classId_idx" ON "public"."Homework"("classId");

-- CreateIndex
CREATE INDEX "Homework_subjectId_idx" ON "public"."Homework"("subjectId");

-- CreateIndex
CREATE UNIQUE INDEX "FeeStructure_academicYearId_name_key" ON "public"."FeeStructure"("academicYearId", "name");

-- CreateIndex
CREATE INDEX "Attendance_date_idx" ON "public"."Attendance"("date");

-- CreateIndex
CREATE INDEX "CanteenItem_schoolId_idx" ON "public"."CanteenItem"("schoolId");

-- CreateIndex
CREATE INDEX "Class_academicYearId_idx" ON "public"."Class"("academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_academicYearId_name_key" ON "public"."Class"("academicYearId", "name");

-- CreateIndex
CREATE INDEX "Grade_homeworkId_idx" ON "public"."Grade"("homeworkId");

-- CreateIndex
CREATE UNIQUE INDEX "Grade_studentId_homeworkId_key" ON "public"."Grade"("studentId", "homeworkId");

-- CreateIndex
CREATE INDEX "Invoice_studentId_idx" ON "public"."Invoice"("studentId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "public"."Invoice"("status");

-- CreateIndex
CREATE UNIQUE INDEX "POSOrder_walletTxnId_key" ON "public"."POSOrder"("walletTxnId");

-- CreateIndex
CREATE INDEX "POSOrder_schoolId_createdAt_idx" ON "public"."POSOrder"("schoolId", "createdAt");

-- CreateIndex
CREATE INDEX "POSOrder_studentId_createdAt_idx" ON "public"."POSOrder"("studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_walletTxnId_key" ON "public"."Payment"("walletTxnId");

-- CreateIndex
CREATE INDEX "Payment_invoiceId_idx" ON "public"."Payment"("invoiceId");

-- CreateIndex
CREATE INDEX "Payment_paymentDate_idx" ON "public"."Payment"("paymentDate");

-- CreateIndex
CREATE UNIQUE INDEX "School_name_key" ON "public"."School"("name");

-- CreateIndex
CREATE UNIQUE INDEX "User_passwordResetToken_key" ON "public"."User"("passwordResetToken");

-- CreateIndex
CREATE INDEX "User_role_schoolId_idx" ON "public"."User"("role", "schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_paymentId_key" ON "public"."WalletTransaction"("paymentId");

-- CreateIndex
CREATE INDEX "WalletTransaction_studentId_createdAt_idx" ON "public"."WalletTransaction"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_schoolId_createdAt_idx" ON "public"."WalletTransaction"("schoolId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."TeacherSubjectAssignment" ADD CONSTRAINT "TeacherSubjectAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherSubjectAssignment" ADD CONSTRAINT "TeacherSubjectAssignment_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TeacherSubjectAssignment" ADD CONSTRAINT "TeacherSubjectAssignment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "public"."Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Homework" ADD CONSTRAINT "Homework_classId_fkey" FOREIGN KEY ("classId") REFERENCES "public"."Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Homework" ADD CONSTRAINT "Homework_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Grade" ADD CONSTRAINT "Grade_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "public"."Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeStructure" ADD CONSTRAINT "FeeStructure_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "public"."AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FeeItem" ADD CONSTRAINT "FeeItem_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "public"."FeeStructure"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_feeStructureId_fkey" FOREIGN KEY ("feeStructureId") REFERENCES "public"."FeeStructure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrder" ADD CONSTRAINT "POSOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrder" ADD CONSTRAINT "POSOrder_walletTxnId_fkey" FOREIGN KEY ("walletTxnId") REFERENCES "public"."WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrderItem" ADD CONSTRAINT "POSOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."CanteenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
