-- Quotations can be made on a lead before it becomes an opportunity (R28).
-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "leadId" TEXT;

-- CreateIndex
CREATE INDEX "Quotation_leadId_idx" ON "Quotation"("leadId");

-- AddForeignKey
ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

