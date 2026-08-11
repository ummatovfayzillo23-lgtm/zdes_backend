-- AlterEnum
ALTER TYPE "PayrollStatus" ADD VALUE 'partially_paid';

-- AlterTable
ALTER TABLE "Payroll" ADD COLUMN     "paidAmount" DECIMAL(15,2) NOT NULL DEFAULT 0;
