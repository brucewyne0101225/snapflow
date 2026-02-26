-- Create enums
CREATE TYPE "UserRole" AS ENUM ('PHOTOGRAPHER', 'ADMIN');
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'LIVE', 'ARCHIVED');
CREATE TYPE "PhotoStatus" AS ENUM ('DRAFT', 'PUBLISHED');
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- Create tables
CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT,
  "role" "UserRole" NOT NULL DEFAULT 'PHOTOGRAPHER',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Event" (
  "id" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "eventDate" TIMESTAMP(3) NOT NULL,
  "venue" TEXT,
  "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
  "pricePhoto" INTEGER NOT NULL DEFAULT 500,
  "priceAll" INTEGER NOT NULL DEFAULT 2500,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Photo" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "thumbKey" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "fileSize" INTEGER,
  "mimeType" TEXT NOT NULL,
  "status" "PhotoStatus" NOT NULL DEFAULT 'DRAFT',
  "capturedAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FaceEmbedding" (
  "id" TEXT NOT NULL,
  "photoId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FaceEmbedding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "buyerId" TEXT,
  "buyerEmail" TEXT NOT NULL,
  "stripeSessionId" TEXT NOT NULL,
  "stripePaymentId" TEXT,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDING',
  "amountTotal" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'usd',
  "payoutStatus" TEXT NOT NULL DEFAULT 'pending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseItem" (
  "id" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "photoId" TEXT,
  "itemType" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Event_slug_key" ON "Event"("slug");
CREATE INDEX "Event_ownerId_idx" ON "Event"("ownerId");
CREATE UNIQUE INDEX "Photo_storageKey_key" ON "Photo"("storageKey");
CREATE INDEX "Photo_eventId_idx" ON "Photo"("eventId");
CREATE INDEX "Photo_eventId_status_idx" ON "Photo"("eventId", "status");
CREATE UNIQUE INDEX "FaceEmbedding_provider_externalId_key" ON "FaceEmbedding"("provider", "externalId");
CREATE INDEX "FaceEmbedding_photoId_idx" ON "FaceEmbedding"("photoId");
CREATE UNIQUE INDEX "Purchase_stripeSessionId_key" ON "Purchase"("stripeSessionId");
CREATE INDEX "Purchase_eventId_idx" ON "Purchase"("eventId");
CREATE INDEX "Purchase_buyerId_idx" ON "Purchase"("buyerId");
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");
CREATE INDEX "PurchaseItem_photoId_idx" ON "PurchaseItem"("photoId");

-- FKs
ALTER TABLE "Event"
  ADD CONSTRAINT "Event_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Photo"
  ADD CONSTRAINT "Photo_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FaceEmbedding"
  ADD CONSTRAINT "FaceEmbedding_photoId_fkey"
  FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_buyerId_fkey"
  FOREIGN KEY ("buyerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_photoId_fkey"
  FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
