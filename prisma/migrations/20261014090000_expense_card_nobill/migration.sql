-- R38: company credit card as a way of paying; a description when an expense has no bill.
-- AlterEnum
ALTER TYPE "ExpensePaidBy" ADD VALUE 'COMPANY_CARD';

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "noBillReason" TEXT;

