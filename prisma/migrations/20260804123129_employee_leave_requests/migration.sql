-- CreateEnum
CREATE TYPE "LeaveDurationType" AS ENUM ('hourly', 'daily', 'multi_day');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- AlterTable
ALTER TABLE "EmployeeLeave" ADD COLUMN     "durationType" "LeaveDurationType" NOT NULL DEFAULT 'daily',
ADD COLUMN     "leaveHours" SMALLINT,
ADD COLUMN     "requestedById" UUID,
ADD COLUMN     "respondedAt" TIMESTAMPTZ(6),
ADD COLUMN     "respondedById" UUID,
ADD COLUMN     "status" "LeaveRequestStatus" NOT NULL DEFAULT 'approved';

-- CreateIndex
CREATE INDEX "EmployeeLeave_status_idx" ON "EmployeeLeave"("status");
