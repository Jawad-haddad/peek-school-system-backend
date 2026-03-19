-- CreateEnum
CREATE TYPE "NfcCardStatus" AS ENUM ('ACTIVE', 'BLOCKED');

-- CreateTable
CREATE TABLE "NfcCard" (
    "id" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "status" "NfcCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "label" TEXT,
    "lastScannedAt" TIMESTAMP(3),
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfcCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NfcCard_studentId_idx" ON "NfcCard"("studentId");

-- CreateIndex
CREATE INDEX "NfcCard_schoolId_idx" ON "NfcCard"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "NfcCard_schoolId_uid_key" ON "NfcCard"("schoolId", "uid");

-- AddForeignKey
ALTER TABLE "NfcCard" ADD CONSTRAINT "NfcCard_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NfcCard" ADD CONSTRAINT "NfcCard_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
