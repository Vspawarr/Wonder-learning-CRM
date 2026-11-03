-- R50: the school's PO received against a quotation ("Convert to PO"), before the sales order is made.
ALTER TABLE "Quotation" ADD COLUMN "schoolPoNumber" TEXT,
ADD COLUMN "schoolPoDate" DATE,
ADD COLUMN "poReceivedAt" TIMESTAMP(3);

ALTER TABLE "PurchaseOrderFile" ALTER COLUMN "salesOrderId" DROP NOT NULL,
ADD COLUMN "quotationId" TEXT;

CREATE UNIQUE INDEX "PurchaseOrderFile_quotationId_key" ON "PurchaseOrderFile"("quotationId");

ALTER TABLE "PurchaseOrderFile" ADD CONSTRAINT "PurchaseOrderFile_quotationId_fkey" FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
