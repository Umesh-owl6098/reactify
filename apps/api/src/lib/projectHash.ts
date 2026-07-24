import { createHash } from "node:crypto";
import type { GeneratedProjectV1 } from "@reactify/generation-contracts";
import { normalizeProjectPath } from "./validation/filePathValidator.js";

export function computeProjectHash(project: GeneratedProjectV1): string {
  const normalizedFiles = project.files
    .map((file) => ({
      path: normalizeProjectPath(file.path),
      content: file.content,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  return createHash("sha256").update(JSON.stringify(normalizedFiles)).digest("hex");
}
