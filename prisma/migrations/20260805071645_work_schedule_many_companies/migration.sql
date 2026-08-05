-- CreateTable
CREATE TABLE "WorkScheduleCompany" (
    "id" UUID NOT NULL,
    "workScheduleId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "branchId" UUID,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "WorkScheduleCompany_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkScheduleCompany_companyId_idx" ON "WorkScheduleCompany"("companyId");

-- CreateIndex
CREATE INDEX "WorkScheduleCompany_branchId_idx" ON "WorkScheduleCompany"("branchId");

-- CreateIndex
CREATE INDEX "WorkScheduleCompany_isDefault_idx" ON "WorkScheduleCompany"("isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "WorkScheduleCompany_workScheduleId_companyId_key" ON "WorkScheduleCompany"("workScheduleId", "companyId");

-- AddForeignKey
ALTER TABLE "WorkScheduleCompany" ADD CONSTRAINT "WorkScheduleCompany_workScheduleId_fkey" FOREIGN KEY ("workScheduleId") REFERENCES "WorkSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScheduleCompany" ADD CONSTRAINT "WorkScheduleCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkScheduleCompany" ADD CONSTRAINT "WorkScheduleCompany_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: preserve every existing WorkSchedule's companyId/branchId/isDefault
-- as its attachment row to its own (owner) company before dropping the columns.
INSERT INTO "WorkScheduleCompany" ("id", "workScheduleId", "companyId", "branchId", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", "companyId", "branchId", "isDefault", "createdAt", "updatedAt"
FROM "WorkSchedule";

-- DropForeignKey
ALTER TABLE "WorkSchedule" DROP CONSTRAINT "WorkSchedule_branchId_fkey";

-- DropIndex
DROP INDEX "WorkSchedule_branchId_idx";

-- DropIndex
DROP INDEX "WorkSchedule_isDefault_idx";

-- AlterTable
ALTER TABLE "WorkSchedule" DROP COLUMN "branchId",
DROP COLUMN "isDefault";
