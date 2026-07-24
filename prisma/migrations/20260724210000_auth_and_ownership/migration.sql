-- Auth models and project ownership.
-- Existing development generations are assigned to LEGACY_MIGRATION_USER_ID
-- (11111111-1111-4111-8111-111111111111, legacy-data@reactify.local).
-- That account is disabled and cannot sign in; it preserves pre-auth data only.

-- CreateTable User
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignedInAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_normalizedEmail_key" ON "User"("normalizedEmail");
CREATE INDEX "User_status_idx" ON "User"("status");

-- Legacy migration user (disabled, no sign-in)
INSERT INTO "User" (
    "id",
    "email",
    "normalizedEmail",
    "passwordHash",
    "displayName",
    "status",
    "createdAt",
    "updatedAt"
) VALUES (
    '11111111-1111-4111-8111-111111111111',
    'legacy-data@reactify.local',
    'legacy-data@reactify.local',
    '$argon2id$v=19$m=19456,t=2,p=1$legacy$placeholder',
    'Legacy Development Data',
    'disabled',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

-- CreateTable Session
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userAgentHash" TEXT,
    "ipHash" TEXT,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable AuthenticationEvent
CREATE TABLE "AuthenticationEvent" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "eventType" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "safeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthenticationEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuthenticationEvent_userId_idx" ON "AuthenticationEvent"("userId");
CREATE INDEX "AuthenticationEvent_eventType_idx" ON "AuthenticationEvent"("eventType");
CREATE INDEX "AuthenticationEvent_createdAt_idx" ON "AuthenticationEvent"("createdAt");

ALTER TABLE "AuthenticationEvent" ADD CONSTRAINT "AuthenticationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add ownerId to UploadedImage
ALTER TABLE "UploadedImage" ADD COLUMN "ownerId" UUID;

UPDATE "UploadedImage" SET "ownerId" = '11111111-1111-4111-8111-111111111111';

ALTER TABLE "UploadedImage" ALTER COLUMN "ownerId" SET NOT NULL;

CREATE INDEX "UploadedImage_ownerId_idx" ON "UploadedImage"("ownerId");

ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add ownerId to Generation
ALTER TABLE "Generation" ADD COLUMN "ownerId" UUID;

UPDATE "Generation" SET "ownerId" = '11111111-1111-4111-8111-111111111111';

ALTER TABLE "Generation" ALTER COLUMN "ownerId" SET NOT NULL;

CREATE INDEX "Generation_ownerId_idx" ON "Generation"("ownerId");

ALTER TABLE "Generation" ADD CONSTRAINT "Generation_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
