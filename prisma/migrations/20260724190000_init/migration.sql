-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "UploadedImage" (
    "id" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalFilename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Generation" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "currentStage" TEXT,
    "sourceImageId" UUID NOT NULL,
    "activeVersionId" TEXT,
    "latestProjectHash" TEXT,
    "stateVersion" INTEGER NOT NULL DEFAULT 1,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "failStage" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "repairRequired" BOOLEAN NOT NULL DEFAULT false,
    "repairStatus" TEXT NOT NULL DEFAULT 'not_required',
    "currentRepairAttempt" INTEGER NOT NULL DEFAULT 0,
    "maxRepairAttempts" INTEGER NOT NULL DEFAULT 3,
    "repairInProgress" BOOLEAN NOT NULL DEFAULT false,
    "manualRetryAllowed" BOOLEAN NOT NULL DEFAULT false,
    "editedByUser" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "awaitingPlanConfirmation" BOOLEAN NOT NULL DEFAULT false,
    "awaitingSandboxValidation" BOOLEAN NOT NULL DEFAULT false,
    "validationReportFingerprint" TEXT,
    "exportInProgress" BOOLEAN NOT NULL DEFAULT false,
    "editInProgress" BOOLEAN NOT NULL DEFAULT false,
    "activeEditId" UUID,
    "rollbackInProgress" BOOLEAN NOT NULL DEFAULT false,
    "visualComparisonInProgress" BOOLEAN NOT NULL DEFAULT false,
    "activeComparisonId" UUID,
    "visualCorrectionInProgress" BOOLEAN NOT NULL DEFAULT false,
    "visualCorrectionAttempt" INTEGER NOT NULL DEFAULT 0,
    "visualCorrectionMaxAttempts" INTEGER NOT NULL DEFAULT 3,
    "previewCaptureRequired" BOOLEAN NOT NULL DEFAULT false,
    "resumeInProgress" BOOLEAN NOT NULL DEFAULT false,
    "sandboxResumeInProgress" BOOLEAN NOT NULL DEFAULT false,
    "pipelineState" JSONB,
    "pendingVisualRecomparison" JSONB,
    "schemaValidation" JSONB,
    "staticValidation" JSONB,
    "sandboxValidation" JSONB,
    "analysisMetadata" JSONB,
    "planMetadata" JSONB,
    "projectMetadata" JSONB,
    "outputsDesignAnalysis" JSONB,
    "outputsGenerationPlan" JSONB,
    "errors" JSONB NOT NULL DEFAULT '[]',
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Generation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineStageRecord" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "stageName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PipelineStageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignAnalysisRecord" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "responseVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "output" JSONB NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "temperature" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignAnalysisRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationPlanRecord" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "responseVersion" TEXT NOT NULL,
    "plan" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenerationPlanRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectVersion" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "versionId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "projectHash" TEXT NOT NULL,
    "parentVersionId" TEXT,
    "sourceVersionId" TEXT,
    "projectSnapshot" JSONB NOT NULL,
    "changedFiles" JSONB NOT NULL DEFAULT '[]',
    "schemaValidationStatus" TEXT,
    "staticValidationStatus" TEXT,
    "compilationStatus" TEXT,
    "runtimeValidationStatus" TEXT,
    "repairAttemptNumber" INTEGER,
    "editId" UUID,
    "comparisonId" UUID,
    "instruction" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RepairAttempt" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "diagnosticsBefore" JSONB NOT NULL,
    "repairabilityClassification" JSONB NOT NULL,
    "patchSummary" TEXT,
    "changedFiles" JSONB NOT NULL DEFAULT '[]',
    "deletedFiles" JSONB NOT NULL DEFAULT '[]',
    "dependencyChanges" JSONB NOT NULL DEFAULT '[]',
    "projectHashBefore" TEXT NOT NULL,
    "projectHashAfter" TEXT,
    "staticValidationAfter" JSONB,
    "sandboxValidationAfter" JSONB,
    "versionIdBefore" TEXT,
    "versionIdAfter" TEXT,
    "patchFingerprint" TEXT,
    "diagnosticsFingerprint" TEXT,
    "failureReason" TEXT,
    "repeatedPatchDetected" BOOLEAN NOT NULL DEFAULT false,
    "repeatedDiagnosticsDetected" BOOLEAN NOT NULL DEFAULT false,
    "unresolvedRisks" JSONB NOT NULL DEFAULT '[]',
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "RepairAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEdit" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "editId" UUID NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "createdVersionId" TEXT,
    "instruction" TEXT NOT NULL,
    "resolvedInstruction" TEXT NOT NULL,
    "intent" JSONB,
    "status" TEXT NOT NULL,
    "projectHashBefore" TEXT,
    "projectHashAfter" TEXT,
    "changedFiles" JSONB NOT NULL DEFAULT '[]',
    "selectedFiles" JSONB NOT NULL DEFAULT '[]',
    "selectedComponentIds" JSONB NOT NULL DEFAULT '[]',
    "pendingEdit" JSONB,
    "pendingIntent" JSONB,
    "clarificationAnswers" JSONB NOT NULL DEFAULT '[]',
    "clarificationRound" INTEGER NOT NULL DEFAULT 0,
    "clarificationQuestion" TEXT,
    "confirmationRequired" BOOLEAN NOT NULL DEFAULT false,
    "versionNumber" INTEGER,
    "idempotencyFingerprint" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectEdit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EditClarification" (
    "id" UUID NOT NULL,
    "editId" UUID NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EditClarification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualComparison" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "versionId" TEXT NOT NULL,
    "projectHash" TEXT NOT NULL,
    "viewport" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "similarityScore" DOUBLE PRECISION,
    "pixelDifferencePercentage" DOUBLE PRECISION,
    "structuralDifferenceScore" DOUBLE PRECISION,
    "regions" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT,
    "correctionRecommended" BOOLEAN NOT NULL DEFAULT false,
    "artifactReferences" JSONB NOT NULL DEFAULT '{}',
    "screenshotSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "idempotencyFingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VisualComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisualCorrectionAttempt" (
    "id" UUID NOT NULL,
    "comparisonId" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "sourceVersionId" TEXT NOT NULL,
    "createdVersionId" TEXT,
    "status" TEXT NOT NULL,
    "previousScore" DOUBLE PRECISION,
    "newScore" DOUBLE PRECISION,
    "changedFiles" JSONB NOT NULL DEFAULT '[]',
    "expectedImprovements" JSONB NOT NULL DEFAULT '[]',
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "VisualCorrectionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectExport" (
    "id" UUID NOT NULL,
    "generationId" UUID NOT NULL,
    "exportId" UUID NOT NULL,
    "versionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "projectHash" TEXT NOT NULL,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB NOT NULL DEFAULT '{}',
    "idempotencyFingerprint" TEXT,
    "artifactReference" TEXT,
    "failureReason" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectExport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "generationId" UUID,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseReference" TEXT,
    "status" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadedImage_storageKey_key" ON "UploadedImage"("storageKey");

-- CreateIndex
CREATE INDEX "UploadedImage_createdAt_idx" ON "UploadedImage"("createdAt");

-- CreateIndex
CREATE INDEX "Generation_status_idx" ON "Generation"("status");

-- CreateIndex
CREATE INDEX "Generation_deletedAt_idx" ON "Generation"("deletedAt");

-- CreateIndex
CREATE INDEX "Generation_createdAt_idx" ON "Generation"("createdAt");

-- CreateIndex
CREATE INDEX "Generation_updatedAt_idx" ON "Generation"("updatedAt");

-- CreateIndex
CREATE INDEX "Generation_latestProjectHash_idx" ON "Generation"("latestProjectHash");

-- CreateIndex
CREATE INDEX "PipelineStageRecord_generationId_stageName_idx" ON "PipelineStageRecord"("generationId", "stageName");

-- CreateIndex
CREATE INDEX "DesignAnalysisRecord_generationId_idx" ON "DesignAnalysisRecord"("generationId");

-- CreateIndex
CREATE INDEX "GenerationPlanRecord_generationId_idx" ON "GenerationPlanRecord"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "GenerationPlanRecord_generationId_revisionNumber_key" ON "GenerationPlanRecord"("generationId", "revisionNumber");

-- CreateIndex
CREATE INDEX "ProjectVersion_generationId_idx" ON "ProjectVersion"("generationId");

-- CreateIndex
CREATE INDEX "ProjectVersion_projectHash_idx" ON "ProjectVersion"("projectHash");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_generationId_versionNumber_key" ON "ProjectVersion"("generationId", "versionNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectVersion_generationId_versionId_key" ON "ProjectVersion"("generationId", "versionId");

-- CreateIndex
CREATE INDEX "RepairAttempt_generationId_idx" ON "RepairAttempt"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "RepairAttempt_generationId_attemptNumber_key" ON "RepairAttempt"("generationId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectEdit_editId_key" ON "ProjectEdit"("editId");

-- CreateIndex
CREATE INDEX "ProjectEdit_generationId_idx" ON "ProjectEdit"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "EditClarification_editId_roundNumber_key" ON "EditClarification"("editId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VisualComparison_comparisonId_key" ON "VisualComparison"("comparisonId");

-- CreateIndex
CREATE INDEX "VisualComparison_generationId_idx" ON "VisualComparison"("generationId");

-- CreateIndex
CREATE INDEX "VisualCorrectionAttempt_generationId_idx" ON "VisualCorrectionAttempt"("generationId");

-- CreateIndex
CREATE UNIQUE INDEX "VisualCorrectionAttempt_comparisonId_attemptNumber_key" ON "VisualCorrectionAttempt"("comparisonId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExport_exportId_key" ON "ProjectExport"("exportId");

-- CreateIndex
CREATE INDEX "ProjectExport_generationId_idx" ON "ProjectExport"("generationId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_scope_idempotencyKey_key" ON "IdempotencyRecord"("scope", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_sourceImageId_fkey" FOREIGN KEY ("sourceImageId") REFERENCES "UploadedImage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineStageRecord" ADD CONSTRAINT "PipelineStageRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignAnalysisRecord" ADD CONSTRAINT "DesignAnalysisRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationPlanRecord" ADD CONSTRAINT "GenerationPlanRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVersion" ADD CONSTRAINT "ProjectVersion_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairAttempt" ADD CONSTRAINT "RepairAttempt_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEdit" ADD CONSTRAINT "ProjectEdit_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EditClarification" ADD CONSTRAINT "EditClarification_editId_fkey" FOREIGN KEY ("editId") REFERENCES "ProjectEdit"("editId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualComparison" ADD CONSTRAINT "VisualComparison_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisualCorrectionAttempt" ADD CONSTRAINT "VisualCorrectionAttempt_comparisonId_fkey" FOREIGN KEY ("comparisonId") REFERENCES "VisualComparison"("comparisonId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExport" ADD CONSTRAINT "ProjectExport_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_generationId_fkey" FOREIGN KEY ("generationId") REFERENCES "Generation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

