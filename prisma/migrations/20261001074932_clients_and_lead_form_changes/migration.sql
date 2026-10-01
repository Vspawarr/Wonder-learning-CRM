-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ONBOARDING', 'ACTIVE');

-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "clientId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "clientId" TEXT;

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "schoolName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "designation" TEXT,
    "mobile" TEXT NOT NULL,
    "email" TEXT,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "area" TEXT,
    "address" TEXT,
    "currentCurriculum" TEXT,
    "studentStrength" INTEGER,
    "branches" INTEGER,
    "status" "ClientStatus" NOT NULL DEFAULT 'ONBOARDING',
    "onboardingCompletedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_number_key" ON "Client"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Client_opportunityId_key" ON "Client"("opportunityId");

-- CreateIndex
CREATE INDEX "Client_ownerId_status_idx" ON "Client"("ownerId", "status");

-- CreateIndex
CREATE INDEX "Activity_clientId_occurredAt_idx" ON "Activity"("clientId", "occurredAt");

-- CreateIndex
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Client numbers start at C-101.
ALTER SEQUENCE "Client_number_seq" RESTART WITH 101;

-- New follow-up type list: Call, WhatsApp/Message, Email, School Visit, Online Demo.
UPDATE "Lead" SET "followUpType" = CASE "followUpType"
  WHEN 'WhatsApp' THEN 'WhatsApp/Message'
  WHEN 'Meeting' THEN 'School Visit'
  WHEN 'Demo' THEN 'Online Demo'
  WHEN 'Proposal Follow-up' THEN 'Call'
  ELSE "followUpType" END
WHERE "followUpType" IN ('WhatsApp', 'Meeting', 'Demo', 'Proposal Follow-up');

UPDATE "Task" SET "type" = CASE "type"
  WHEN 'WhatsApp' THEN 'WhatsApp/Message'
  WHEN 'Meeting' THEN 'School Visit'
  WHEN 'Demo' THEN 'Online Demo'
  WHEN 'Proposal Follow-up' THEN 'Call'
  ELSE "type" END
WHERE "type" IN ('WhatsApp', 'Meeting', 'Demo', 'Proposal Follow-up');
