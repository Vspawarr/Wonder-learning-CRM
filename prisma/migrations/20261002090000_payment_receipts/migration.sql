-- Payment receipts: a running receipt number and a share token per payment.
ALTER TABLE "Payment" ADD COLUMN "number" TEXT,
ADD COLUMN "year" INTEGER,
ADD COLUMN "month" INTEGER,
ADD COLUMN "seq" INTEGER,
ADD COLUMN "shareToken" TEXT;

-- Number payments already recorded, by the month they were entered (IST).
WITH n AS (
  SELECT id,
    EXTRACT(YEAR FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int AS y,
    EXTRACT(MONTH FROM ("createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata'))::int AS m,
    ROW_NUMBER() OVER (
      PARTITION BY date_trunc('month', "createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')
      ORDER BY "createdAt", id
    )::int AS s
  FROM "Payment"
)
UPDATE "Payment" p SET
  year = n.y, month = n.m, seq = n.s,
  number = 'RCPT/' || n.y || '/' || lpad(n.m::text, 2, '0') || '/' || lpad(n.s::text, 3, '0'),
  "shareToken" = md5(random()::text || p.id) || md5(random()::text || clock_timestamp()::text)
FROM n WHERE n.id = p.id;

ALTER TABLE "Payment" ALTER COLUMN "number" SET NOT NULL,
ALTER COLUMN "year" SET NOT NULL,
ALTER COLUMN "month" SET NOT NULL,
ALTER COLUMN "seq" SET NOT NULL,
ALTER COLUMN "shareToken" SET NOT NULL;

CREATE UNIQUE INDEX "Payment_number_key" ON "Payment"("number");
CREATE UNIQUE INDEX "Payment_shareToken_key" ON "Payment"("shareToken");
CREATE UNIQUE INDEX "Payment_year_month_seq_key" ON "Payment"("year", "month", "seq");
