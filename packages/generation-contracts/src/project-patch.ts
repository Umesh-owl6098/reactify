import { z } from "zod";
import { DiagnosticSchema } from "./sandbox-validation.js";

export const PatchChangedFileSchema = z.object({
  path: z.string(),
  fullContent: z.string(),
  language: z.enum(["tsx", "ts", "css", "json", "html", "js"]),
  reason: z.string(),
});

export const PatchDeletedFileSchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export const PatchDependencyChangeSchema = z.object({
  packageName: z.string(),
  action: z.enum(["add", "update", "remove"]),
  targetGroup: z.enum(["dependencies", "devDependencies"]),
  version: z.string().optional(),
  reason: z.string(),
});

export const ProjectPatchV1Schema = z.object({
  schemaVersion: z.literal("1"),
  responseVersion: z.string(),
  repairSummary: z.string(),
  changedFiles: z.array(PatchChangedFileSchema),
  deletedFiles: z.array(PatchDeletedFileSchema).default([]),
  dependencyChanges: z.array(PatchDependencyChangeSchema).default([]),
  expectedResolvedDiagnostics: z.array(DiagnosticSchema).default([]),
  unresolvedRisks: z.array(z.string()).default([]),
});

export type PatchChangedFile = z.infer<typeof PatchChangedFileSchema>;
export type PatchDeletedFile = z.infer<typeof PatchDeletedFileSchema>;
export type PatchDependencyChange = z.infer<typeof PatchDependencyChangeSchema>;
export type ProjectPatchV1 = z.infer<typeof ProjectPatchV1Schema>;
