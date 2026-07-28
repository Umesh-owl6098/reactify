import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import type {
  PreviewScreenshotSubmission,
  VisualComparisonRequest,
  VisualComparisonResult,
  VisualCorrectionRequest,
  VisualCorrectionV1,
} from "@reactify/generation-contracts";
import { VisualComparisonResultSchema } from "@reactify/generation-contracts";
import type { AIImageInput, AIInput, AIProvider, LoadPromptFn } from "@reactify/shared";
import { ErrorCode, type ErrorCode as ErrorCodeType } from "@reactify/shared";
import type { Env } from "../../env.js";
import type { GenerationRecord } from "../../pipeline/types.js";
import { ALLOWED_DEPENDENCIES } from "../allowlist.js";
import type { ImageStorage } from "../imageStorage.js";
import { applyProjectPatch } from "../repair/patchApplicator.js";
import { validateProjectPatch } from "../repair/patchValidator.js";
import { AIProviderError } from "../../providers/provider-errors.js";
import { resolveOperationAIConfig } from "../../providers/ai-provider-config.js";
import { createProjectVersion } from "../edit/versionStore.js";
import { ComparisonArtifactStore } from "./comparisonArtifactStore.js";
import { runVisualComparison } from "./comparisonEngine.js";
import { parseVisualCorrectionResponse } from "./parseVisualCorrectionResponse.js";
import { resolveComparisonViewport } from "./resolveComparisonViewport.js";
import { validatePreviewScreenshot } from "./screenshotValidator.js";
import { summarizeFidelityIssues, validateVisualFidelity } from "../visual-fidelity/visualFidelityValidator.js";
import { evaluateVisualComparisonEligibility } from "./visualComparisonEligibility.js";
import { visualCorrectionToPatch } from "./visualCorrectionToPatch.js";

export interface InternalVisualComparisonRecord extends VisualComparisonResult {
  idempotencyFingerprint?: string;
  screenshotSubmitted?: boolean;
  patchFingerprint?: string;
  targetedRegionIds?: string[];
}

export interface VisualComparisonServiceDeps {
  aiProvider: AIProvider;
  loadPrompt: LoadPromptFn;
  env: Env;
  imageStorage: ImageStorage;
  artifactStore: ComparisonArtifactStore;
}

export type VisualComparisonServiceResult =
  | { ok: true; comparison: VisualComparisonResult; duplicate?: boolean }
  | { ok: false; errorCode: ErrorCodeType; message: string; statusCode: number };

function toResult(record: InternalVisualComparisonRecord): VisualComparisonResult {
  return VisualComparisonResultSchema.parse({
    comparisonId: record.comparisonId,
    generationId: record.generationId,
    versionId: record.versionId,
    projectHash: record.projectHash,
    status: record.status,
    sourceImage: record.sourceImage,
    previewImage: record.previewImage,
    viewport: record.viewport,
    overallSimilarityScore: record.overallSimilarityScore,
    pixelDifferencePercentage: record.pixelDifferencePercentage,
    structuralDifferenceScore: record.structuralDifferenceScore,
    regions: record.regions,
    summary: record.summary,
    correctionRecommended: record.correctionRecommended,
    createdAt: record.createdAt,
    completedAt: record.completedAt,
    failureReason: record.failureReason,
    parentComparisonId: record.parentComparisonId,
    correctionAttemptNumber: record.correctionAttemptNumber,
    improvementOutcome: record.improvementOutcome,
    baselineSimilarityScore: record.baselineSimilarityScore,
  });
}

function computeComparisonFingerprint(input: {
  generationId: string;
  versionId: string;
  projectHash: string;
  viewport: VisualComparisonRequest["viewport"];
  idempotencyKey?: string;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        generationId: input.generationId,
        versionId: input.versionId,
        projectHash: input.projectHash,
        viewport: input.viewport,
        idempotencyKey: input.idempotencyKey ?? "",
      }),
    )
    .digest("hex");
}

function failComparison(comparison: InternalVisualComparisonRecord, message: string): void {
  comparison.status = "failed";
  comparison.failureReason = message;
  comparison.completedAt = new Date().toISOString();
}

export class VisualComparisonService {
  constructor(private readonly deps: VisualComparisonServiceDeps) {}

  static fromDeps(deps: VisualComparisonServiceDeps): VisualComparisonService {
    return new VisualComparisonService(deps);
  }

  listComparisons(record: GenerationRecord): VisualComparisonResult[] {
    return record.visualComparisons.map((comparison) => toResult(comparison));
  }

  getComparison(record: GenerationRecord, comparisonId: string): VisualComparisonResult | undefined {
    const comparison = record.visualComparisons.find((entry) => entry.comparisonId === comparisonId);
    return comparison ? toResult(comparison) : undefined;
  }

  /** Dimensions of the uploaded design, or null when it cannot be measured. */
  private async readSourceDimensions(record: GenerationRecord): Promise<{ width: number; height: number } | null> {
    try {
      const sourceImage = await this.deps.imageStorage.get(record.imageId);
      if (!sourceImage) {
        return null;
      }

      const metadata = await sharp(sourceImage.buffer).metadata();
      if (!metadata.width || !metadata.height) {
        return null;
      }

      return { width: metadata.width, height: metadata.height };
    } catch {
      // A viewport fallback is always better than blocking the comparison.
      return null;
    }
  }

  private verifyProjectHash(record: GenerationRecord, expectedProjectHash: string): VisualComparisonServiceResult | null {
    if (!record.projectHash || record.projectHash !== expectedProjectHash) {
      return {
        ok: false,
        errorCode: ErrorCode.STALE_PROJECT_HASH,
        message: "Project hash is stale. Refresh and try again.",
        statusCode: 409,
      };
    }
    return null;
  }

  async createComparison(
    record: GenerationRecord,
    request: VisualComparisonRequest,
    idempotencyKey?: string,
  ): Promise<VisualComparisonServiceResult> {
    const eligibility = evaluateVisualComparisonEligibility(record);
    if (!eligibility.ok) {
      return {
        ok: false,
        errorCode: eligibility.errorCode,
        message: eligibility.message,
        statusCode: eligibility.errorCode === ErrorCode.GENERATION_NOT_FOUND ? 404 : 409,
      };
    }

    const hashError = this.verifyProjectHash(record, request.expectedProjectHash);
    if (hashError) {
      return hashError;
    }

    // The client only knows a viewport preset. The server owns the uploaded
    // design, so it is the only place that can align the capture viewport with
    // the real source aspect ratio.
    const viewport = resolveComparisonViewport(request.viewport, await this.readSourceDimensions(record));

    const fingerprint = computeComparisonFingerprint({
      generationId: record.id,
      versionId: record.activeVersionId!,
      projectHash: record.projectHash!,
      viewport,
      idempotencyKey,
    });

    const existing = record.visualComparisons.find(
      (comparison) =>
        comparison.idempotencyFingerprint === fingerprint &&
        !["failed"].includes(comparison.status),
    );
    if (existing) {
      return { ok: true, comparison: toResult(existing), duplicate: true };
    }

    const comparisonId = randomUUID();
    const createdAt = new Date().toISOString();
    const comparison: InternalVisualComparisonRecord = {
      comparisonId,
      generationId: record.id,
      versionId: record.activeVersionId!,
      projectHash: record.projectHash!,
      status: "awaiting_capture",
      sourceImage: { width: 0, height: 0 },
      previewImage: { width: 0, height: 0 },
      viewport,
      overallSimilarityScore: 0,
      pixelDifferencePercentage: 0,
      structuralDifferenceScore: 0,
      regions: [],
      summary: "Awaiting preview screenshot capture.",
      correctionRecommended: false,
      createdAt,
      idempotencyFingerprint: fingerprint,
      screenshotSubmitted: false,
    };

    record.visualComparisons.push(comparison);
    record.activeComparisonId = comparisonId;
    record.visualComparisonInProgress = true;
    record.previewCaptureRequired = true;
    record.updatedAt = createdAt;

    return { ok: true, comparison: toResult(comparison), duplicate: false };
  }

  async submitScreenshot(
    record: GenerationRecord,
    comparisonId: string,
    submission: PreviewScreenshotSubmission,
  ): Promise<VisualComparisonServiceResult> {
    const comparison = record.visualComparisons.find((entry) => entry.comparisonId === comparisonId);
    if (!comparison) {
      return {
        ok: false,
        errorCode: ErrorCode.GENERATION_NOT_FOUND,
        message: "Visual comparison not found.",
        statusCode: 404,
      };
    }

    if (comparison.screenshotSubmitted) {
      return {
        ok: false,
        errorCode: ErrorCode.INVALID_GENERATION_STATE,
        message: "Screenshot has already been submitted for this comparison.",
        statusCode: 409,
      };
    }

    if (!["awaiting_capture", "awaiting_revalidation"].includes(comparison.status)) {
      return {
        ok: false,
        errorCode: ErrorCode.INVALID_GENERATION_STATE,
        message: "This comparison is not awaiting a screenshot.",
        statusCode: 409,
      };
    }

    const hashError = this.verifyProjectHash(record, submission.expectedProjectHash);
    if (hashError) {
      return hashError;
    }

    if (comparison.projectHash !== submission.expectedProjectHash) {
      return {
        ok: false,
        errorCode: ErrorCode.STALE_PROJECT_HASH,
        message: "Screenshot project hash does not match the active comparison.",
        statusCode: 409,
      };
    }

    const screenshotValidation = validatePreviewScreenshot(submission.screenshotBase64, this.deps.env);
    if (!screenshotValidation.ok) {
      failComparison(comparison, screenshotValidation.message);
      record.visualComparisonInProgress = false;
      record.previewCaptureRequired = false;
      return {
        ok: false,
        errorCode: screenshotValidation.errorCode,
        message: screenshotValidation.message,
        statusCode: 422,
      };
    }

    const sourceImage = await this.deps.imageStorage.get(record.imageId);
    if (!sourceImage) {
      failComparison(comparison, "Uploaded source screenshot was not found.");
      record.visualComparisonInProgress = false;
      record.previewCaptureRequired = false;
      return {
        ok: false,
        errorCode: ErrorCode.SOURCE_IMAGE_NOT_FOUND,
        message: "Uploaded source screenshot was not found.",
        statusCode: 404,
      };
    }

    comparison.status = "processing";
    record.updatedAt = new Date().toISOString();

    try {
      const result = await runVisualComparison(
        sourceImage.buffer,
        screenshotValidation.buffer,
        comparison.viewport,
        this.deps.env,
      );

      comparison.sourceImage = result.sourceImage;
      comparison.previewImage = result.previewImage;
      comparison.overallSimilarityScore = result.overallSimilarityScore;
      comparison.pixelDifferencePercentage = result.pixelDifferencePercentage;
      comparison.structuralDifferenceScore = result.structuralDifferenceScore;
      comparison.regions = result.regions;
      comparison.summary = result.summary;
      comparison.correctionRecommended = result.correctionRecommended;
      comparison.completedAt = new Date().toISOString();
      comparison.screenshotSubmitted = true;

      await this.deps.artifactStore.saveArtifacts(record.id, comparison.comparisonId, {
        source: result.artifacts.sourcePng,
        preview: result.artifacts.previewPng,
        diff: result.artifacts.diffPng,
        overlay: result.artifacts.overlayPng,
        regions: result.artifacts.regionsPng,
      });

      if (comparison.parentComparisonId && comparison.baselineSimilarityScore !== undefined) {
        const delta = result.overallSimilarityScore - comparison.baselineSimilarityScore;
        if (delta >= this.deps.env.VISUAL_CORRECTION_MIN_IMPROVEMENT) {
          comparison.improvementOutcome = "improved";
        } else if (delta <= -this.deps.env.VISUAL_CORRECTION_MIN_IMPROVEMENT) {
          comparison.improvementOutcome = "regressed";
        } else {
          comparison.improvementOutcome = "unchanged";
        }
      }

      comparison.status = result.correctionRecommended ? "correction_available" : "completed";
      record.visualComparisonInProgress = false;
      record.previewCaptureRequired = false;
      record.activeComparisonId = comparison.comparisonId;
      record.updatedAt = comparison.completedAt;

      return { ok: true, comparison: toResult(comparison) };
    } catch {
      failComparison(comparison, "Visual comparison processing failed.");
      record.visualComparisonInProgress = false;
      record.previewCaptureRequired = false;
      return {
        ok: false,
        errorCode: ErrorCode.VISUAL_COMPARISON_FAILED,
        message: "Visual comparison processing failed.",
        statusCode: 500,
      };
    }
  }

  async applyCorrection(
    record: GenerationRecord,
    comparisonId: string,
    request: VisualCorrectionRequest,
  ): Promise<VisualComparisonServiceResult> {
    const comparison = record.visualComparisons.find((entry) => entry.comparisonId === comparisonId);
    if (!comparison) {
      return {
        ok: false,
        errorCode: ErrorCode.GENERATION_NOT_FOUND,
        message: "Visual comparison not found.",
        statusCode: 404,
      };
    }

    if (comparison.status !== "correction_available" || !comparison.correctionRecommended) {
      return {
        ok: false,
        errorCode: ErrorCode.INVALID_GENERATION_STATE,
        message: "Visual correction is not available for this comparison.",
        statusCode: 409,
      };
    }

    if (record.visualCorrectionAttempt >= record.visualCorrectionMaxAttempts) {
      return {
        ok: false,
        errorCode: ErrorCode.VISUAL_CORRECTION_ATTEMPTS_EXHAUSTED,
        message: "Maximum visual correction attempts reached.",
        statusCode: 409,
      };
    }

    const hashError = this.verifyProjectHash(record, request.expectedProjectHash);
    if (hashError) {
      return hashError;
    }

    if (comparison.projectHash !== request.expectedProjectHash) {
      return {
        ok: false,
        errorCode: ErrorCode.STALE_PROJECT_HASH,
        message: "Comparison project hash is stale.",
        statusCode: 409,
      };
    }

    if (
      record.visualCorrectionInProgress ||
      record.editInProgress ||
      record.repairInProgress ||
      record.rollbackInProgress ||
      record.exportInProgress
    ) {
      return {
        ok: false,
        errorCode: ErrorCode.INVALID_GENERATION_STATE,
        message: "Another project mutation is already in progress.",
        statusCode: 409,
      };
    }

    record.visualCorrectionInProgress = true;
    comparison.status = "correcting";
    record.updatedAt = new Date().toISOString();

    try {
      const project = record.outputs.generatedProject!;
      const correctionResult = await this.generateVisualCorrection(record, comparison, project);
      if (!correctionResult.ok) {
        comparison.status = "correction_available";
        record.visualCorrectionInProgress = false;
        return correctionResult;
      }

      const patch = visualCorrectionToPatch(correctionResult.correction);
      const patchFingerprint = createHash("sha256").update(JSON.stringify(patch)).digest("hex");
      const repeatedPatch = record.visualComparisons.some(
        (entry) => entry.patchFingerprint === patchFingerprint && entry.comparisonId !== comparison.comparisonId,
      );
      if (repeatedPatch) {
        comparison.status = "correction_available";
        record.visualCorrectionInProgress = false;
        return {
          ok: false,
          errorCode: ErrorCode.VISUAL_CORRECTION_REPEATED,
          message: "An identical visual correction patch was already attempted.",
          statusCode: 409,
        };
      }

      const patchValidation = validateProjectPatch(patch, {
        maxFileBytes: this.deps.env.MAX_PATCH_FILE_BYTES,
        maxTotalBytes: this.deps.env.MAX_PATCH_TOTAL_BYTES,
      });
      if (!patchValidation.ok) {
        comparison.status = "correction_available";
        record.visualCorrectionInProgress = false;
        return {
          ok: false,
          errorCode:
            patchValidation.errorCode === ErrorCode.PATCH_SECURITY_VIOLATION
              ? ErrorCode.VISUAL_CORRECTION_SECURITY_VIOLATION
              : patchValidation.errorCode,
          message: patchValidation.message,
          statusCode: 422,
        };
      }

      const applyResult = applyProjectPatch(project, patchValidation.patch);
      if (!applyResult.ok) {
        comparison.status = "correction_available";
        record.visualCorrectionInProgress = false;
        return {
          ok: false,
          errorCode: ErrorCode.PATCH_APPLY_FAILED,
          message: applyResult.message,
          statusCode: 422,
        };
      }

      if (applyResult.result.projectHash === record.projectHash) {
        comparison.status = "correction_available";
        record.visualCorrectionInProgress = false;
        return {
          ok: false,
          errorCode: ErrorCode.VISUAL_CORRECTION_NO_EFFECT,
          message: "Visual correction did not change the project.",
          statusCode: 422,
        };
      }

      record.visualCorrectionAttempt += 1;
      const parentVersionId = record.activeVersionId!;
      const changedFiles = [...applyResult.result.changedPaths, ...applyResult.result.deletedPaths];
      const version = createProjectVersion({
        record,
        project: applyResult.result.project,
        source: "visual_correction",
        label: `Visual Correction ${record.visualCorrectionAttempt}`,
        parentVersionId,
        changedFiles,
      });

      record.outputs.generatedProject = applyResult.result.project;
      record.projectHash = applyResult.result.projectHash;
      record.schemaValidation = { valid: true, errors: [] };
      record.staticValidation = applyResult.result.staticValidation;
      record.awaitingSandboxValidation = true;
      record.validationReportFingerprint = null;
      record.sandboxValidation = null;
      record.status = "Compiling";
      record.previewCaptureRequired = true;

      comparison.patchFingerprint = patchFingerprint;
      comparison.targetedRegionIds = correctionResult.correction.targetedRegions;
      comparison.status = "awaiting_revalidation";
      comparison.correctionAttemptNumber = record.visualCorrectionAttempt;
      record.visualCorrectionInProgress = false;
      record.visualComparisonInProgress = false;
      record.activeComparisonId = comparison.comparisonId;
      record.updatedAt = new Date().toISOString();

      // Create follow-up comparison placeholder after sandbox validation completes via store hook.
      record.pendingVisualRecomparison = {
        parentComparisonId: comparison.comparisonId,
        baselineSimilarityScore: comparison.overallSimilarityScore,
        versionId: version.versionId,
        viewport: comparison.viewport,
      };

      return { ok: true, comparison: toResult(comparison) };
    } catch {
      comparison.status = "correction_available";
      record.visualCorrectionInProgress = false;
      return {
        ok: false,
        errorCode: ErrorCode.INTERNAL_ERROR,
        message: "Visual correction failed.",
        statusCode: 500,
      };
    }
  }

  private async generateVisualCorrection(
    record: GenerationRecord,
    comparison: InternalVisualComparisonRecord,
    project: NonNullable<GenerationRecord["outputs"]["generatedProject"]>,
  ): Promise<
    | { ok: true; correction: VisualCorrectionV1 }
    | { ok: false; errorCode: ErrorCodeType; message: string; statusCode: number }
  > {
    try {
      const prompt = this.deps.loadPrompt("visual-correction");
      const allowlist = JSON.stringify([...ALLOWED_DEPENDENCIES].sort());
      const aiConfig = resolveOperationAIConfig(this.deps.env, "visual_correction");
      const priorAttempts = record.visualComparisons
        .filter((entry) => entry.correctionAttemptNumber)
        .map((entry) => ({
          comparisonId: entry.comparisonId,
          attempt: entry.correctionAttemptNumber,
          similarity: entry.overallSimilarityScore,
          outcome: entry.improvementOutcome,
        }));

      // Region boxes and a similarity number describe *that* the preview is
      // wrong, never *what it should look like*. Without the design itself the
      // model can only nudge colours and spacing, which is why corrections
      // never recovered objects the first pass dropped.
      const sourceInputs: AIInput[] = [];
      const composition = record.outputs.designAnalysis?.visualComposition;
      try {
        const sourceImage = await this.deps.imageStorage.get(record.imageId);
        if (sourceImage) {
          sourceInputs.push({ text: "Original uploaded design screenshot (the target to match):" });
          sourceInputs.push({
            base64: sourceImage.buffer.toString("base64"),
            mimeType: sourceImage.mimeType as AIImageInput["mimeType"],
          });
        }
      } catch {
        // A missing source only weakens the correction; it must not fail it.
      }

      if (composition) {
        const report = validateVisualFidelity(composition, project);
        if (!report.acceptable) {
          sourceInputs.push({
            text: `Structural fidelity issues that must be fixed:\n${summarizeFidelityIssues(report)}`,
          });
        }
      }

      const invocation = await this.deps.aiProvider.invoke(
        [
          { text: prompt.content },
          { text: `Approved dependency allowlist:\n${allowlist}` },
          ...sourceInputs,
          { text: `Visual comparison summary:\n${comparison.summary}` },
          { text: `Difference regions:\n${JSON.stringify(comparison.regions)}` },
          { text: `Active GeneratedProjectV1:\n${JSON.stringify(project)}` },
          { text: `Design analysis:\n${JSON.stringify(record.outputs.designAnalysis)}` },
          { text: `Generation plan:\n${JSON.stringify(record.outputs.generationPlan)}` },
          { text: `Viewport:\n${JSON.stringify(comparison.viewport)}` },
          { text: `Prior visual correction attempts:\n${JSON.stringify(priorAttempts)}` },
        ],
        {
          promptVersion: prompt.meta.promptVersion,
          model: aiConfig.model,
          temperature: aiConfig.temperature,
          maxTokens: aiConfig.maxTokens,
          timeoutMs: aiConfig.timeoutMs,
        },
      );

      const parsed = parseVisualCorrectionResponse(invocation.rawText);
      if (!parsed.ok) {
        return { ok: false, errorCode: parsed.errorCode, message: parsed.message, statusCode: 422 };
      }

      return { ok: true, correction: parsed.correction };
    } catch (error) {
      if (error instanceof AIProviderError) {
        return {
          ok: false,
          errorCode: error.errorCode,
          message: error.message,
          statusCode: error.errorCode === ErrorCode.AI_TIMEOUT ? 504 : 502,
        };
      }
      return { ok: false, errorCode: ErrorCode.AI_ERROR, message: "Visual correction generation failed.", statusCode: 502 };
    }
  }
  async readArtifact(
    record: GenerationRecord,
    comparisonId: string,
    artifactType: import("@reactify/generation-contracts").VisualComparisonArtifactType,
  ): Promise<Buffer | null> {
    const comparison = record.visualComparisons.find((entry) => entry.comparisonId === comparisonId);
    if (!comparison || comparison.status === "awaiting_capture") {
      return null;
    }

    return this.deps.artifactStore.readArtifact(record.id, comparisonId, artifactType);
  }
}

export function completeVisualCorrectionAfterValidation(record: GenerationRecord, success: boolean): void {
  if (!success || !record.pendingVisualRecomparison) {
    record.pendingVisualRecomparison = null;
    record.previewCaptureRequired = false;
    return;
  }

  const pending = record.pendingVisualRecomparison;
  const comparisonId = randomUUID();
  const createdAt = new Date().toISOString();
  const comparison: InternalVisualComparisonRecord = {
    comparisonId,
    generationId: record.id,
    versionId: pending.versionId,
    projectHash: record.projectHash!,
    status: "awaiting_capture",
    sourceImage: { width: 0, height: 0 },
    previewImage: { width: 0, height: 0 },
    viewport: pending.viewport,
    overallSimilarityScore: 0,
    pixelDifferencePercentage: 0,
    structuralDifferenceScore: 0,
    regions: [],
    summary: "Awaiting post-correction preview screenshot capture.",
    correctionRecommended: false,
    createdAt,
    parentComparisonId: pending.parentComparisonId,
    baselineSimilarityScore: pending.baselineSimilarityScore,
    correctionAttemptNumber: record.visualCorrectionAttempt,
    screenshotSubmitted: false,
  };

  record.visualComparisons.push(comparison);
  record.activeComparisonId = comparisonId;
  record.visualComparisonInProgress = true;
  record.previewCaptureRequired = true;
  record.pendingVisualRecomparison = null;
  record.updatedAt = createdAt;
}