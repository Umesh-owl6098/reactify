import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { VisualComparisonArtifactType } from "@reactify/generation-contracts";

const ARTIFACT_FILES: Record<VisualComparisonArtifactType, string> = {
  source: "source.png",
  preview: "preview.png",
  diff: "diff.png",
  overlay: "overlay.png",
  regions: "regions.png",
};

export class ComparisonArtifactStore {
  constructor(private readonly rootDir: string) {}

  async ensureReady(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
  }

  private comparisonDir(generationId: string, comparisonId: string): string {
    return path.join(this.rootDir, generationId, comparisonId);
  }

  async saveArtifacts(
    generationId: string,
    comparisonId: string,
    artifacts: Record<VisualComparisonArtifactType, Buffer>,
  ): Promise<void> {
    const dir = this.comparisonDir(generationId, comparisonId);
    await mkdir(dir, { recursive: true });

    await Promise.all(
      (Object.entries(ARTIFACT_FILES) as Array<[VisualComparisonArtifactType, string]>).map(
        async ([type, filename]) => {
          const buffer = artifacts[type];
          if (buffer) {
            await writeFile(path.join(dir, filename), buffer);
          }
        },
      ),
    );
  }

  async readArtifact(
    generationId: string,
    comparisonId: string,
    artifactType: VisualComparisonArtifactType,
  ): Promise<Buffer | null> {
    const filePath = path.join(this.comparisonDir(generationId, comparisonId), ARTIFACT_FILES[artifactType]);
    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  }
}
