-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN "resultJson" TEXT;
ALTER TABLE "Attempt" ADD COLUMN "enrichmentState" TEXT NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE "Attempt" ADD COLUMN "enrichmentLeaseId" TEXT;
ALTER TABLE "Attempt" ADD COLUMN "enrichmentLeaseExpiresAt" DATETIME;

-- AlterTable
ALTER TABLE "ReviewLog" ADD COLUMN "resultJson" TEXT;
