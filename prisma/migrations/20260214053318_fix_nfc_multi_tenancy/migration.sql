/*
  Warnings:

  - You are about to drop the column `isActive` on the `AcademicYear` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorCode` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `twoFactorCodeExpires` on the `School` table. All the data in the column will be lost.
  - You are about to drop the column `date_of_birth` on the `Student` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[schoolId,nfc_card_id]` on the table `Student` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[classId,name]` on the table `Subject` will be added. If there are existing duplicate values, this will fail.
  - Changed the type of `status` on the `BusTripEntry` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Added the required column `classId` to the `Subject` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TripStatus" AS ENUM ('active', 'completed');

-- CreateEnum
CREATE TYPE "BusTripEntryStatus" AS ENUM ('pending', 'boarded', 'skipped');

-- CreateEnum
CREATE TYPE "AnnouncementScope" AS ENUM ('SCHOOL', 'CLASS');

-- DropIndex
DROP INDEX "AcademicYear_schoolId_isActive_idx";

-- DropIndex
DROP INDEX "Student_nfc_card_id_key";

-- DropIndex
DROP INDEX "Subject_schoolId_name_key";

-- AlterTable
ALTER TABLE "AcademicYear" DROP COLUMN "isActive",
ADD COLUMN     "current" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "BusTrip" ADD COLUMN     "status" "TripStatus" NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "BusTripEntry" DROP COLUMN "status",
ADD COLUMN     "status" "BusTripEntryStatus" NOT NULL;

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "defaultFee" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "School" DROP COLUMN "twoFactorCode",
DROP COLUMN "twoFactorCodeExpires";

-- AlterTable
ALTER TABLE "Student" DROP COLUMN "date_of_birth",
ADD COLUMN     "balance" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "dob" TIMESTAMP(3),
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "paid" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "totalFee" DECIMAL(12,2) NOT NULL DEFAULT 0.00;

-- AlterTable
ALTER TABLE "Subject" ADD COLUMN     "classId" TEXT NOT NULL,
ADD COLUMN     "teacherId" TEXT;

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "scope" "AnnouncementScope" NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_schoolId_idx" ON "Announcement"("schoolId");

-- CreateIndex
CREATE INDEX "Announcement_classId_idx" ON "Announcement"("classId");

-- CreateIndex
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");

-- CreateIndex
CREATE INDEX "Message_receiverId_idx" ON "Message"("receiverId");

-- CreateIndex
CREATE INDEX "AcademicYear_schoolId_current_idx" ON "AcademicYear"("schoolId", "current");

-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_nfc_card_id_key" ON "Student"("schoolId", "nfc_card_id");

-- CreateIndex
CREATE INDEX "Subject_classId_idx" ON "Subject"("classId");

-- CreateIndex
CREATE INDEX "Subject_teacherId_idx" ON "Subject"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Subject_classId_name_key" ON "Subject"("classId", "name");

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
