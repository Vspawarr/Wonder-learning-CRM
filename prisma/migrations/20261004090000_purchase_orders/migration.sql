-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "poDate" DATE,
ADD COLUMN     "poNumber" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrderFile" (
    "id" TEXT NOT NULL,
    "salesOrderId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderFile_salesOrderId_key" ON "PurchaseOrderFile"("salesOrderId");

-- AddForeignKey
ALTER TABLE "PurchaseOrderFile" ADD CONSTRAINT "PurchaseOrderFile_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderFile" ADD CONSTRAINT "PurchaseOrderFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
