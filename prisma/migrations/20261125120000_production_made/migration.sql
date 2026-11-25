-- R55: kits finished per production line (ready in batches).
-- AlterTable
ALTER TABLE "ProductionLine" ADD COLUMN     "made" INTEGER NOT NULL DEFAULT 0;


-- Orders already marked ready made all their kits.
UPDATE "ProductionLine" l SET "made" = l."qty" FROM "ProductionOrder" o WHERE o."id" = l."productionOrderId" AND o."status" = 'READY';
