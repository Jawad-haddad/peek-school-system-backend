-- CreateEnum
CREATE TYPE "NfcDeviceStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateTable
CREATE TABLE "NfcDevice" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "status" "NfcDeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NfcDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NfcDevice_schoolId_idx" ON "NfcDevice"("schoolId");

-- CreateIndex
CREATE UNIQUE INDEX "NfcDevice_schoolId_deviceId_key" ON "NfcDevice"("schoolId", "deviceId");

-- AddForeignKey
ALTER TABLE "NfcDevice" ADD CONSTRAINT "NfcDevice_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
