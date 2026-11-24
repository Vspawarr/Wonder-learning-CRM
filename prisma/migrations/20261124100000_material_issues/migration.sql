-- R53: incomplete / damaged / returned material, settled by replacement or refund.
-- AlterTable
ALTER TABLE "Dispatch" ADD COLUMN     "isReplacement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "DispatchItem" ADD COLUMN     "note" TEXT;

-- CreateTable
CREATE TABLE "MaterialIssue" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "dispatchId" TEXT,
    "salesOrderItemId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "detail" TEXT,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "replacementId" TEXT,
    "creditNoteId" TEXT,
    "refundAmount" DECIMAL(14,2),
    "resolvedOn" DATE,
    "resolvedNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MaterialIssue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_replacementId_key" ON "MaterialIssue"("replacementId");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialIssue_creditNoteId_key" ON "MaterialIssue"("creditNoteId");

-- CreateIndex
CREATE INDEX "MaterialIssue_clientId_idx" ON "MaterialIssue"("clientId");

-- CreateIndex
CREATE INDEX "MaterialIssue_salesOrderId_idx" ON "MaterialIssue"("salesOrderId");

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_dispatchId_fkey" FOREIGN KEY ("dispatchId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_salesOrderItemId_fkey" FOREIGN KEY ("salesOrderItemId") REFERENCES "SalesOrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_replacementId_fkey" FOREIGN KEY ("replacementId") REFERENCES "Dispatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialIssue" ADD CONSTRAINT "MaterialIssue_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

