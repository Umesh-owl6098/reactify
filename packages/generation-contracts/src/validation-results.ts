import { z } from "zod";

export const ValidationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  filePath: z.string().optional(),
  line: z.number().int().optional(),
  column: z.number().int().optional(),
  severity: z.enum(["error", "warning"]),
});

export const SchemaValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationIssueSchema),
});

export const StaticValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(ValidationIssueSchema),
  warnings: z.array(ValidationIssueSchema),
});

export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;
export type SchemaValidationResult = z.infer<typeof SchemaValidationResultSchema>;
export type StaticValidationResult = z.infer<typeof StaticValidationResultSchema>;
