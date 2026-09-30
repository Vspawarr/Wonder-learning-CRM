-- CreateEnum
CREATE TYPE "Role" AS ENUM ('DIRECTOR', 'SALES_MANAGER', 'SALES_EXECUTIVE');

-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('SERVICE', 'MATERIAL');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'DISQUALIFIED');

-- CreateEnum
CREATE TYPE "Temperature" AS ENUM ('HOT', 'WARM', 'COLD');

-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('INTERESTED', 'DEMO_SCHEDULED', 'PROPOSAL_SENT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('PHONE', 'WHATSAPP', 'EMAIL', 'MEETING', 'SITE_VISIT', 'NOTE', 'SYSTEM');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductType" NOT NULL,
    "category" TEXT,
    "price" DECIMAL(12,2),
    "gstRate" DECIMAL(5,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "stateName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
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
    "source" TEXT NOT NULL,
    "referenceName" TEXT,
    "remarks" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "temperature" "Temperature" NOT NULL DEFAULT 'WARM',
    "assignedToId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "nextFollowUpDate" DATE,
    "followUpType" TEXT,
    "followUpRemark" TEXT,
    "disqualifyReason" TEXT,
    "disqualifyRemarks" TEXT,
    "disqualifiedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadInterest" (
    "leadId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "LeadInterest_pkey" PRIMARY KEY ("leadId","productId")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "leadId" TEXT,
    "schoolName" TEXT NOT NULL,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'INTERESTED',
    "probability" INTEGER NOT NULL,
    "expectedCloseDate" DATE,
    "competitor" TEXT,
    "decisionMaker" TEXT,
    "nextAction" TEXT,
    "nextActionDate" DATE,
    "lostReason" TEXT,
    "lostRemarks" TEXT,
    "closedAt" TIMESTAMP(3),
    "ownerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityItem" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(12,2),

    CONSTRAINT "OpportunityItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityStageChange" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" "OpportunityStage",
    "toStage" "OpportunityStage" NOT NULL,
    "changedById" TEXT NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpportunityStageChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "remark" TEXT,
    "dueDate" DATE NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "completedAt" TIMESTAMP(3),
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "leadId" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "subject" TEXT NOT NULL,
    "summary" TEXT,
    "nextAction" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "byId" TEXT NOT NULL,
    "leadId" TEXT,
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Product_code_key" ON "Product"("code");

-- CreateIndex
CREATE UNIQUE INDEX "City_stateName_name_key" ON "City"("stateName", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_number_key" ON "Lead"("number");

-- CreateIndex
CREATE INDEX "Lead_assignedToId_status_idx" ON "Lead"("assignedToId", "status");

-- CreateIndex
CREATE INDEX "Lead_nextFollowUpDate_idx" ON "Lead"("nextFollowUpDate");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_number_key" ON "Opportunity"("number");

-- CreateIndex
CREATE INDEX "Opportunity_ownerId_stage_idx" ON "Opportunity"("ownerId", "stage");

-- CreateIndex
CREATE INDEX "Opportunity_leadId_idx" ON "Opportunity"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityItem_opportunityId_productId_key" ON "OpportunityItem"("opportunityId", "productId");

-- CreateIndex
CREATE INDEX "OpportunityStageChange_opportunityId_changedAt_idx" ON "OpportunityStageChange"("opportunityId", "changedAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_dueDate_idx" ON "Task"("assigneeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");

-- CreateIndex
CREATE INDEX "Task_opportunityId_idx" ON "Task"("opportunityId");

-- CreateIndex
CREATE INDEX "Activity_leadId_occurredAt_idx" ON "Activity"("leadId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_opportunityId_occurredAt_idx" ON "Activity"("opportunityId", "occurredAt");

-- CreateIndex
CREATE INDEX "Activity_byId_occurredAt_idx" ON "Activity"("byId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInterest" ADD CONSTRAINT "LeadInterest_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadInterest" ADD CONSTRAINT "LeadInterest_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityItem" ADD CONSTRAINT "OpportunityItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityItem" ADD CONSTRAINT "OpportunityItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageChange" ADD CONSTRAINT "OpportunityStageChange_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityStageChange" ADD CONSTRAINT "OpportunityStageChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_byId_fkey" FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Human-readable record numbers start where the business expects them (L-1001, O-2001).
ALTER SEQUENCE "Lead_number_seq" RESTART WITH 1001;
ALTER SEQUENCE "Opportunity_number_seq" RESTART WITH 2001;
