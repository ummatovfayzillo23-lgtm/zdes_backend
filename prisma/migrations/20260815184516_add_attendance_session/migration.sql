-- AlterEnum
ALTER TYPE "AttendanceSource" ADD VALUE 'mobile';

-- CreateTable
CREATE TABLE "AttendanceSession" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "employeeId" UUID NOT NULL,
    "attendanceId" UUID,
    "date" DATE NOT NULL,
    "checkIn" TIMESTAMPTZ(6) NOT NULL,
    "checkOut" TIMESTAMPTZ(6),
    "checkInImageUrl" VARCHAR(500) NOT NULL,
    "checkOutImageUrl" VARCHAR(500),
    "checkInSimilarity" DOUBLE PRECISION NOT NULL,
    "checkOutSimilarity" DOUBLE PRECISION,
    "workedMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceSession_companyId_idx" ON "AttendanceSession"("companyId");

-- CreateIndex
CREATE INDEX "AttendanceSession_branchId_idx" ON "AttendanceSession"("branchId");

-- CreateIndex
CREATE INDEX "AttendanceSession_employeeId_idx" ON "AttendanceSession"("employeeId");

-- CreateIndex
CREATE INDEX "AttendanceSession_attendanceId_idx" ON "AttendanceSession"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceSession_date_idx" ON "AttendanceSession"("date");

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
