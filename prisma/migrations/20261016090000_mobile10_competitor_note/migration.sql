-- AlterTable
ALTER TABLE "Opportunity" ADD COLUMN     "competitorNote" TEXT;


-- R41: mobile numbers are kept as 10 digits. Tidy existing ones ("+91 98220 12345", "098220-12345" → "9822012345")
-- where that gives exactly 10 digits; anything else is left as it is for someone to correct.
CREATE FUNCTION pg_temp.mobile10(s TEXT) RETURNS TEXT AS $$
  SELECT CASE
    WHEN length(d) = 12 AND left(d, 2) = '91' THEN substr(d, 3)
    ELSE d
  END
  FROM (SELECT regexp_replace(regexp_replace(coalesce(s, ''), '[^0-9]', '', 'g'), '^0+', '') AS d) x;
$$ LANGUAGE SQL IMMUTABLE;

UPDATE "Lead" SET "mobile" = pg_temp.mobile10("mobile") WHERE length(pg_temp.mobile10("mobile")) = 10 AND "mobile" <> pg_temp.mobile10("mobile");
UPDATE "Client" SET "mobile" = pg_temp.mobile10("mobile") WHERE length(pg_temp.mobile10("mobile")) = 10 AND "mobile" <> pg_temp.mobile10("mobile");
UPDATE "ClientContact" SET "mobile" = pg_temp.mobile10("mobile") WHERE "mobile" IS NOT NULL AND length(pg_temp.mobile10("mobile")) = 10 AND "mobile" <> pg_temp.mobile10("mobile");
UPDATE "User" SET "mobile" = pg_temp.mobile10("mobile") WHERE "mobile" IS NOT NULL AND length(pg_temp.mobile10("mobile")) = 10 AND "mobile" <> pg_temp.mobile10("mobile");
