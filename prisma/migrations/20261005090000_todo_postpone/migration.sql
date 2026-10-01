-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "dueTime" TEXT,
ADD COLUMN     "postponeReason" TEXT,
ADD COLUMN     "postponedCount" INTEGER NOT NULL DEFAULT 0;
