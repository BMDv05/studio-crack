-- CreateEnum
CREATE TYPE "MeetingType" AS ENUM ('online', 'in_person');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('new', 'confirmed', 'declined', 'closed');

-- CreateEnum
CREATE TYPE "VideoCategory" AS ENUM ('production', 'social');

-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "VideoProcessing" AS ENUM ('uploading', 'processing', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('status', 'note');

-- CreateTable
CREATE TABLE "admins" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "tokenHash" TEXT NOT NULL,
    "adminId" UUID NOT NULL,
    "csrf" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "booking_requests" (
    "id" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "service" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "preferredDate" TEXT NOT NULL,
    "preferredTime" TEXT NOT NULL,
    "meetingType" "MeetingType" NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'new',
    "statusChangedAt" TIMESTAMP(3),
    "studioEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "clientEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "confirmEmailSent" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "submissionKey" TEXT,

    CONSTRAINT "booking_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_events" (
    "id" SERIAL NOT NULL,
    "bookingId" UUID NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author" TEXT NOT NULL DEFAULT '',
    "kind" "EventKind" NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" "VideoCategory" NOT NULL DEFAULT 'production',
    "videoUrl" TEXT NOT NULL DEFAULT '',
    "thumbnailUrl" TEXT NOT NULL DEFAULT '',
    "durationSec" DOUBLE PRECISION,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "mime" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT 'local',
    "originalName" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "platforms" JSONB NOT NULL DEFAULT '[]',
    "clientName" TEXT NOT NULL DEFAULT '',
    "status" "VideoStatus" NOT NULL DEFAULT 'draft',
    "processing" "VideoProcessing" NOT NULL DEFAULT 'uploading',
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admins_email_key" ON "admins"("email");

-- CreateIndex
CREATE INDEX "admin_sessions_adminId_idx" ON "admin_sessions"("adminId");

-- CreateIndex
CREATE UNIQUE INDEX "booking_requests_submissionKey_key" ON "booking_requests"("submissionKey");

-- CreateIndex
CREATE INDEX "booking_requests_status_createdAt_idx" ON "booking_requests"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "request_events_bookingId_id_idx" ON "request_events"("bookingId", "id");

-- CreateIndex
CREATE INDEX "videos_category_status_sortOrder_idx" ON "videos"("category", "status", "sortOrder");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "admins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_events" ADD CONSTRAINT "request_events_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "booking_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
