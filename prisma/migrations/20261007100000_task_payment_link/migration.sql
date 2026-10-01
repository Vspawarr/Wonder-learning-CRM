-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "paymentId" TEXT;
-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
