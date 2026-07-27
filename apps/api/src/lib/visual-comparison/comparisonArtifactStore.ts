import type { VisualComparisonArtifactType } from "@reactify/generation-contracts";
import type { StorageProvider } from "../storage/types.js";

const ARTIFACT_FILES: Record<VisualComparisonArtifactType, string> = {
  source: "source.png",
  preview: "preview.png",
  diff: "diff.png",
  overlay: "overlay.png",
  regions: "regions.png",
};

export class ComparisonArtifactStore {
  constructor(private readonly storage: StorageProvider) {}

  async ensureReady(): Promise<void> {
    // Object storage does not require local directory initialization.
  }

  private artifactKey(
    generationId: string,
    comparisonId: string,
    artifactType: VisualComparisonArtifactType,
  ): string {
    return `comparisons/${generationId}/${comparisonId}/${ARTIFACT_FILES[artifactType]}`;
  }

  async saveArtifacts(
    generationId: string,
    comparisonId: string,
    artifacts: Record<VisualComparisonArtifactType, Buffer>,
  ): Promise<void> {
    await Promise.all(
      (Object.entries(ARTIFACT_FILES) as Array<[VisualComparisonArtifactType, string]>).map(
        async ([type]) => {
          const buffer = artifacts[type];
          if (buffer) {
            await this.storage.putObject(this.artifactKey(generationId, comparisonId, type), buffer, {
              contentType: "image/png",
              contentLength: buffer.length,
            });
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
    return this.storage.getObject(this.artifactKey(generationId, comparisonId, artifactType));
  }
}
