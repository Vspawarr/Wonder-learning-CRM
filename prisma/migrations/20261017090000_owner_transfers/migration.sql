
-- CreateTable
CREATE TABLE "OwnerTransfer" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "reason" TEXT,
    "status" "SpendApproval" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OwnerTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OwnerTransfer_status_idx" ON "OwnerTransfer"("status");

-- CreateIndex
CREATE INDEX "OwnerTransfer_leadId_idx" ON "OwnerTransfer"("leadId");

-- CreateIndex
CREATE INDEX "OwnerTransfer_clientId_idx" ON "OwnerTransfer"("clientId");

-- AddForeignKey
ALTER TABLE "OwnerTransfer" ADD CONSTRAINT "OwnerTransfer_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerTransfer" ADD CONSTRAINT "OwnerTransfer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerTransfer" ADD CONSTRAINT "OwnerTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerTransfer" ADD CONSTRAINT "OwnerTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerTransfer" ADD CONSTRAINT "OwnerTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OwnerTransfer" ADD CONSTRAINT "OwnerTransfer_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
