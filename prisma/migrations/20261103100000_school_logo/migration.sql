-- R51: the school's logo (sent by the school), printed on its PO template.
-- CreateTable
CREATE TABLE "SchoolLogo" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "clientId" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SchoolLogo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLogo_leadId_key" ON "SchoolLogo"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "SchoolLogo_clientId_key" ON "SchoolLogo"("clientId");

-- AddForeignKey
ALTER TABLE "SchoolLogo" ADD CONSTRAINT "SchoolLogo_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLogo" ADD CONSTRAINT "SchoolLogo_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SchoolLogo" ADD CONSTRAINT "SchoolLogo_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

