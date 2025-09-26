/*
  Warnings:

  - You are about to drop the column `absence_reason` on the `Attendance` table. All the data in the column will be lost.
  - You are about to drop the column `category` on the `CanteenItem` table. All the data in the column will be lost.
  - You are about to drop the column `isAvailable` on the `CanteenItem` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `CanteenItem` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to drop the column `comments` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `grade` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `homeworkId` on the `Grade` table. All the data in the column will be lost.
  - You are about to drop the column `feeStructureId` on the `Invoice` table. All the data in the column will be lost.
  - You are about to alter the column `totalAmount` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `amountPaid` on the `Invoice` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - The `status` column on the `Invoice` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `paymentDate` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `paymentMethod` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `transactionId` on the `Payment` table. All the data in the column will be lost.
  - You are about to alter the column `amount` on the `Payment` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to alter the column `wallet_balance` on the `Student` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `Decimal(12,2)`.
  - You are about to drop the column `passwordResetExpires` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `passwordResetToken` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `FeeItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `FeeStructure` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Homework` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `TeacherSubjectAssignment` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[schoolId,name]` on the table `AcademicYear` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[studentId,date]` on the table `Attendance` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[schoolId,name]` on the table `CanteenItem` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[schoolId,academicYearId,name]` on the table `Class` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[schoolId,name]` on the table `Subject` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `academicYearId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `classId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schoolId` to the `Attendance` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `status` on the `Attendance` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `schoolId` to the `Class` table without a default value. This is not possible if the table is not empty.
  - Added the required column `academicYearId` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `maxScore` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schoolId` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `score` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `subjectId` to the `Grade` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schoolId` to the `Invoice` table without a default value. This is not possible if the table is not empty.
  - Added the required column `method` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schoolId` to the `Payment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `School` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Student` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schoolId` to the `StudentEnrollment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `User` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `role` on the `User` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('parent', 'teacher', 'school_admin', 'finance', 'canteen_staff', 'super_admin');

-- CreateEnum
CREATE TYPE "public"."AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "public"."InvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "public"."PaymentMethod" AS ENUM ('CASH', 'CARD', 'BANK_TRANSFER', 'WALLET', 'ONLINE_GATEWAY');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "public"."WalletTxnType" AS ENUM ('TOPUP', 'PURCHASE', 'REFUND', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "public"."TripDirection" AS ENUM ('MORNING', 'AFTERNOON');

-- DropForeignKey
ALTER TABLE "public"."AcademicYear" DROP CONSTRAINT "AcademicYear_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Attendance" DROP CONSTRAINT "Attendance_studentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."AuditLog" DROP CONSTRAINT "AuditLog_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."CanteenItem" DROP CONSTRAINT "CanteenItem_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Class" DROP CONSTRAINT "Class_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."FeeItem" DROP CONSTRAINT "FeeItem_feeStructureId_fkey";

-- DropForeignKey
ALTER TABLE "public"."FeeStructure" DROP CONSTRAINT "FeeStructure_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Grade" DROP CONSTRAINT "Grade_homeworkId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Grade" DROP CONSTRAINT "Grade_studentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Homework" DROP CONSTRAINT "Homework_classId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_feeStructureId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Invoice" DROP CONSTRAINT "Invoice_studentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."NotificationPreference" DROP CONSTRAINT "NotificationPreference_userId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Payment" DROP CONSTRAINT "Payment_invoiceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Student" DROP CONSTRAINT "Student_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StudentEnrollment" DROP CONSTRAINT "StudentEnrollment_academicYearId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StudentEnrollment" DROP CONSTRAINT "StudentEnrollment_classId_fkey";

-- DropForeignKey
ALTER TABLE "public"."StudentEnrollment" DROP CONSTRAINT "StudentEnrollment_studentId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Subject" DROP CONSTRAINT "Subject_schoolId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TeacherSubjectAssignment" DROP CONSTRAINT "TeacherSubjectAssignment_classId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TeacherSubjectAssignment" DROP CONSTRAINT "TeacherSubjectAssignment_subjectId_fkey";

-- DropForeignKey
ALTER TABLE "public"."TeacherSubjectAssignment" DROP CONSTRAINT "TeacherSubjectAssignment_teacherId_fkey";

-- DropIndex
DROP INDEX "public"."User_passwordResetToken_key";

-- AlterTable
ALTER TABLE "public"."AcademicYear" ALTER COLUMN "isActive" SET DEFAULT false;

-- AlterTable
ALTER TABLE "public"."Attendance" DROP COLUMN "absence_reason",
ADD COLUMN     "academicYearId" TEXT NOT NULL,
ADD COLUMN     "classId" TEXT NOT NULL,
ADD COLUMN     "schoolId" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "public"."AttendanceStatus" NOT NULL;

-- AlterTable
ALTER TABLE "public"."AuditLog" ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "public"."CanteenItem" DROP COLUMN "category",
DROP COLUMN "isAvailable",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "price" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."Class" ADD COLUMN     "schoolId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Grade" DROP COLUMN "comments",
DROP COLUMN "grade",
DROP COLUMN "homeworkId",
ADD COLUMN     "academicYearId" TEXT NOT NULL,
ADD COLUMN     "maxScore" DECIMAL(6,2) NOT NULL,
ADD COLUMN     "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "schoolId" TEXT NOT NULL,
ADD COLUMN     "score" DECIMAL(6,2) NOT NULL,
ADD COLUMN     "subjectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Invoice" DROP COLUMN "feeStructureId",
ADD COLUMN     "memo" TEXT,
ADD COLUMN     "schoolId" TEXT NOT NULL,
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "amountPaid" SET DATA TYPE DECIMAL(12,2),
DROP COLUMN "status",
ADD COLUMN     "status" "public"."InvoiceStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "public"."Payment" DROP COLUMN "paymentDate",
DROP COLUMN "paymentMethod",
DROP COLUMN "transactionId",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "externalRef" TEXT,
ADD COLUMN     "method" "public"."PaymentMethod" NOT NULL,
ADD COLUMN     "schoolId" TEXT NOT NULL,
ADD COLUMN     "studentId" TEXT,
ALTER COLUMN "invoiceId" DROP NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."School" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "public"."Student" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "wallet_balance" SET DATA TYPE DECIMAL(12,2);

-- AlterTable
ALTER TABLE "public"."StudentEnrollment" ADD COLUMN     "schoolId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "public"."Subject" ADD COLUMN     "academicYearId" TEXT;

-- AlterTable
ALTER TABLE "public"."User" DROP COLUMN "passwordResetExpires",
DROP COLUMN "passwordResetToken",
ADD COLUMN     "emailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
DROP COLUMN "role",
ADD COLUMN     "role" "public"."UserRole" NOT NULL;

-- DropTable
DROP TABLE "public"."FeeItem";

-- DropTable
DROP TABLE "public"."FeeStructure";

-- DropTable
DROP TABLE "public"."Homework";

-- DropTable
DROP TABLE "public"."TeacherSubjectAssignment";

-- CreateTable
CREATE TABLE "public"."WalletTransaction" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "paymentId" TEXT,
    "posOrderId" TEXT,
    "type" "public"."WalletTxnType" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."POSOrder" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "studentId" TEXT,
    "orderedByUserId" TEXT NOT NULL,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "total" DECIMAL(12,2) NOT NULL,
    "walletTransactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "POSOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."POSOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "canteenItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "POSOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusTrip" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "direction" "public"."TripDirection" NOT NULL,
    "routeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BusTripEntry" (
    "id" TEXT NOT NULL,
    "busTripId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "boardedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,

    CONSTRAINT "BusTripEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_posOrderId_key" ON "public"."WalletTransaction"("posOrderId");

-- CreateIndex
CREATE INDEX "WalletTransaction_schoolId_studentId_createdAt_idx" ON "public"."WalletTransaction"("schoolId", "studentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "POSOrder_walletTransactionId_key" ON "public"."POSOrder"("walletTransactionId");

-- CreateIndex
CREATE INDEX "POSOrder_schoolId_status_idx" ON "public"."POSOrder"("schoolId", "status");

-- CreateIndex
CREATE INDEX "POSOrder_studentId_idx" ON "public"."POSOrder"("studentId");

-- CreateIndex
CREATE INDEX "POSOrderItem_orderId_idx" ON "public"."POSOrderItem"("orderId");

-- CreateIndex
CREATE INDEX "BusTrip_schoolId_date_idx" ON "public"."BusTrip"("schoolId", "date");

-- CreateIndex
CREATE INDEX "BusTrip_supervisorId_idx" ON "public"."BusTrip"("supervisorId");

-- CreateIndex
CREATE INDEX "BusTripEntry_studentId_idx" ON "public"."BusTripEntry"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "BusTripEntry_busTripId_studentId_key" ON "public"."BusTripEntry"("busTripId", "studentId");

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_isActive_idx" ON "public"."AcademicYear"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "public"."AcademicYear"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Attendance_schoolId_classId_date_idx" ON "public"."Attendance"("schoolId", "classId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_studentId_date_key" ON "public"."Attendance"("studentId", "date");

-- CreateIndex
CREATE INDEX "AuditLog_schoolId_timestamp_idx" ON "public"."AuditLog"("schoolId", "timestamp");

-- CreateIndex
CREATE INDEX "AuditLog_userId_timestamp_idx" ON "public"."AuditLog"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "CanteenItem_schoolId_isActive_idx" ON "public"."CanteenItem"("schoolId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CanteenItem_schoolId_name_key" ON "public"."CanteenItem"("schoolId", "name");

-- CreateIndex
CREATE INDEX "Class_schoolId_academicYearId_idx" ON "public"."Class"("schoolId", "academicYearId");

-- CreateIndex
CREATE UNIQUE INDEX "Class_schoolId_academicYearId_name_key" ON "public"."Class"("schoolId", "academicYearId", "name");

-- CreateIndex
CREATE INDEX "Grade_schoolId_subjectId_idx" ON "public"."Grade"("schoolId", "subjectId");

-- CreateIndex
CREATE INDEX "Invoice_schoolId_studentId_idx" ON "public"."Invoice"("schoolId", "studentId");

-- CreateIndex
CREATE INDEX "Payment_schoolId_invoiceId_idx" ON "public"."Payment"("schoolId", "invoiceId");

-- CreateIndex
CREATE INDEX "School_name_idx" ON "public"."School"("name");

-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "public"."Student"("schoolId");

-- CreateIndex
CREATE INDEX "Student_parentId_idx" ON "public"."Student"("parentId");

-- CreateIndex
CREATE INDEX "StudentEnrollment_classId_idx" ON "public"."StudentEnrollment"("classId");

-- CreateIndex
CREATE INDEX "Subject_schoolId_idx" ON "public"."Subject"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_schoolId_name_key" ON "public"."Subject"("schoolId", "name");

-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "public"."User"("schoolId");

-- AddForeignKey
ALTER TABLE "public"."Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Class" ADD CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Class" ADD CONSTRAINT "Class_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "public"."AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subject" ADD CONSTRAINT "Subject_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "public"."AcademicYear"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_classId_fkey" FOREIGN KEY ("classId") REFERENCES "public"."Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "public"."AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_classId_fkey" FOREIGN KEY ("classId") REFERENCES "public"."Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Attendance" ADD CONSTRAINT "Attendance_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "public"."AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Grade" ADD CONSTRAINT "Grade_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Grade" ADD CONSTRAINT "Grade_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Grade" ADD CONSTRAINT "Grade_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Grade" ADD CONSTRAINT "Grade_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "public"."AcademicYear"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invoice" ADD CONSTRAINT "Invoice_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "public"."Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletTransaction" ADD CONSTRAINT "WalletTransaction_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletTransaction" ADD CONSTRAINT "WalletTransaction_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WalletTransaction" ADD CONSTRAINT "WalletTransaction_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CanteenItem" ADD CONSTRAINT "CanteenItem_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrder" ADD CONSTRAINT "POSOrder_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrder" ADD CONSTRAINT "POSOrder_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrder" ADD CONSTRAINT "POSOrder_orderedByUserId_fkey" FOREIGN KEY ("orderedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrder" ADD CONSTRAINT "POSOrder_walletTransactionId_fkey" FOREIGN KEY ("walletTransactionId") REFERENCES "public"."WalletTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrderItem" ADD CONSTRAINT "POSOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."POSOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."POSOrderItem" ADD CONSTRAINT "POSOrderItem_canteenItemId_fkey" FOREIGN KEY ("canteenItemId") REFERENCES "public"."CanteenItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusTrip" ADD CONSTRAINT "BusTrip_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusTrip" ADD CONSTRAINT "BusTrip_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusTripEntry" ADD CONSTRAINT "BusTripEntry_busTripId_fkey" FOREIGN KEY ("busTripId") REFERENCES "public"."BusTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BusTripEntry" ADD CONSTRAINT "BusTripEntry_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "public"."Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
