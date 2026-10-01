-- CreateTable
CREATE TABLE "State" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "State_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "State_name_key" ON "State"("name");

-- Starting list of states (admins add more in Settings → Locations), plus any state
-- already used by an existing city so the link below is valid.
INSERT INTO "State" ("id", "name", "sortOrder") VALUES
  ('state_maharashtra', 'Maharashtra', 1),
  ('state_gujarat', 'Gujarat', 2),
  ('state_goa', 'Goa', 3),
  ('state_madhya_pradesh', 'Madhya Pradesh', 4),
  ('state_rajasthan', 'Rajasthan', 5),
  ('state_karnataka', 'Karnataka', 6),
  ('state_telangana', 'Telangana', 7),
  ('state_chhattisgarh', 'Chhattisgarh', 8);
INSERT INTO "State" ("id", "name", "sortOrder")
  SELECT 'state_' || md5("stateName"), "stateName", 100 FROM (SELECT DISTINCT "stateName" FROM "City") c
  ON CONFLICT ("name") DO NOTHING;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_stateName_fkey" FOREIGN KEY ("stateName") REFERENCES "State"("name") ON DELETE RESTRICT ON UPDATE CASCADE;
