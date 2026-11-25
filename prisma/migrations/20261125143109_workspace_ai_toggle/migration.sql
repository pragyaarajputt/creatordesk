-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "aiEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiEnabledAt" TIMESTAMP(3);
