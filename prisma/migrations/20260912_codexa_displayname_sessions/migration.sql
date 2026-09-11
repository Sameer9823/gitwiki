-- Add displayName to Repository and title fields to ChatSession
ALTER TABLE "Repository" ADD COLUMN "displayName" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "title" TEXT;
ALTER TABLE "ChatSession" ADD COLUMN "titleManuallySet" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ChatSession" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
