-- R53: marketing material library.
-- CreateTable
CREATE TABLE "MarketingItem" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT,
    "fileName" TEXT,
    "contentType" TEXT,
    "size" INTEGER,
    "data" BYTEA,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MarketingItem_category_idx" ON "MarketingItem"("category");

-- AddForeignKey
ALTER TABLE "MarketingItem" ADD CONSTRAINT "MarketingItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

