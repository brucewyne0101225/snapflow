ALTER TABLE "Photo"
  ADD COLUMN "isUploaded" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "uploadedAt" TIMESTAMP(3);

CREATE INDEX "Photo_eventId_isUploaded_idx" ON "Photo"("eventId", "isUploaded");
