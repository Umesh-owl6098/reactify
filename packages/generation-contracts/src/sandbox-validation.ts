import { z } from "zod";

export const DiagnosticSeveritySchema = z.enum(["error", "warning", "info"]);

export const DiagnosticSourceSchema = z.enum([
  "sandpack",
  "bundler",
  "typescript",
  "runtime",
  "console",
  "react",
]);

export const DiagnosticSchema = z.object({
  code: z.string(),
  message: z.string().max(2000),
  severity: DiagnosticSeveritySchema,
  source: DiagnosticSourceSchema,
  category: z.string(),
  filePath: z.string().optional(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  stack: z.string().max(4000).optional(),
});

export const SandboxCompilationResultSchema = z.object({
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  errors: z.array(DiagnosticSchema),
  warnings: z.array(DiagnosticSchema),
});

export const SandboxRuntimeResultSchema = z.object({
  success: z.boolean(),
  durationMs: z.number().nonnegative(),
  errors: z.array(DiagnosticSchema),
  warnings: z.array(DiagnosticSchema),
});

export const SandboxValidationRequestSchema = z.object({
  generationId: z.string().uuid(),
  projectHash: z.string().min(16).max(128),
  compilation: SandboxCompilationResultSchema,
  runtime: SandboxRuntimeResultSchema,
  validatedAt: z.string().datetime(),
});

export const SandboxValidationResponseSchema = z.object({
  status: z.enum(["Compiling", "Repairing", "Ready", "Failed", "RepairRequired", "RepairFailed"]),
});

export const SandboxValidationSnapshotSchema = z.object({
  projectHash: z.string(),
  compilation: SandboxCompilationResultSchema,
  runtime: SandboxRuntimeResultSchema,
  validatedAt: z.string().datetime(),
});

export type Diagnostic = z.infer<typeof DiagnosticSchema>;
export type SandboxCompilationResult = z.infer<typeof SandboxCompilationResultSchema>;
export type SandboxRuntimeResult = z.infer<typeof SandboxRuntimeResultSchema>;
export type SandboxValidationRequest = z.infer<typeof SandboxValidationRequestSchema>;
export type SandboxValidationResponse = z.infer<typeof SandboxValidationResponseSchema>;
export type SandboxValidationSnapshot = z.infer<typeof SandboxValidationSnapshotSchema>;
