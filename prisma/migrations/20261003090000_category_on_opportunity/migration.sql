-- Category (Hot / Warm / Cold) moves from the lead to the opportunity.
ALTER TABLE "Opportunity" ADD COLUMN "temperature" "Temperature" NOT NULL DEFAULT 'WARM';

UPDATE "Opportunity" o SET "temperature" = l."temperature"
FROM "Lead" l WHERE o."leadId" = l."id";

ALTER TABLE "Lead" DROP COLUMN "temperature";
