-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('RECEIVED', 'IN_HAND', 'DEPOSITED', 'CLEARED', 'BOUNCED');
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bank" TEXT,
ADD COLUMN     "chequeDate" DATE,
ADD COLUMN     "salesOrderId" TEXT,
ADD COLUMN     "status" "PaymentStatus" NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "statusAt" TIMESTAMP(3),
ALTER COLUMN "invoiceId" DROP NOT NULL;
-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "proformaDate" DATE,
ADD COLUMN     "proformaNumber" TEXT;
-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "seq" INTEGER NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_number_key" ON "CreditNote"("number");
-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");
-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_year_month_seq_key" ON "CreditNote"("year", "month", "seq");
-- CreateIndex
CREATE INDEX "Payment_salesOrderId_idx" ON "Payment"("salesOrderId");
-- CreateIndex
CREATE UNIQUE INDEX "SalesOrder_proformaNumber_key" ON "SalesOrder"("proformaNumber");
-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Existing payments belong to their invoice's sales order too.
UPDATE "Payment" p SET "salesOrderId" = i."salesOrderId" FROM "Invoice" i WHERE p."invoiceId" = i.id;
