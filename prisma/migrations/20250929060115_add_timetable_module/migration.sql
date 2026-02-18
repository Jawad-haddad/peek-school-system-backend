-- CreateTable
CREATE TABLE "public"."TimeTableEntry" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "dayOfWeek" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,

    CONSTRAINT "TimeTableEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeTableEntry_classId_dayOfWeek_idx" ON "public"."TimeTableEntry"("classId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "TimeTableEntry_teacherId_idx" ON "public"."TimeTableEntry"("teacherId");

-- AddForeignKey
ALTER TABLE "public"."TimeTableEntry" ADD CONSTRAINT "TimeTableEntry_classId_fkey" FOREIGN KEY ("classId") REFERENCES "public"."Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeTableEntry" ADD CONSTRAINT "TimeTableEntry_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "public"."Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeTableEntry" ADD CONSTRAINT "TimeTableEntry_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TimeTableEntry" ADD CONSTRAINT "TimeTableEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "public"."School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
