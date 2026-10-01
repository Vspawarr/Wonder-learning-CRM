-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "expectedValue" DECIMAL(14,2);

-- Keep today's pipeline values: deals whose items had prices start with that total.
UPDATE "Opportunity" o SET "expectedValue" = t.total
FROM (
  SELECT "opportunityId", SUM("qty" * "unitPrice") AS total
  FROM "OpportunityItem" WHERE "unitPrice" IS NOT NULL
  GROUP BY "opportunityId"
) t
WHERE t."opportunityId" = o."id" AND t.total > 0;
