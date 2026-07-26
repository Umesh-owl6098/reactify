import { describe, expect, it, vi, beforeEach } from "vitest";
import { resetActiveGenerationSession, startNewGeneration } from "./startNewGeneration";
import { useGenerationStore } from "./generationStore";
import { useJobStore } from "../jobs/jobStore";
import { useUploadStore } from "../upload/uploadStore";

describe("startNewGeneration", () => {
  beforeEach(() => {
    useUploadStore.setState({
      status: "success",
      progress: 100,
      error: null,
      upload: {
        imageId: "11111111-1111-4111-8111-111111111111",
        mimeType: "image/png",
        sizeBytes: 100,
        previewUrl: "/api/v1/images/11111111-1111-4111-8111-111111111111/preview",
      },
      localPreviewUrl: null,
      selectedFile: null,
    });
    useGenerationStore.setState({
      generationId: "76825ff8-3eef-4202-9370-e8fd3b290742",
      status: null,
      error: "failed",
      isLoading: false,
      isPolling: false,
    });
    useJobStore.setState({ activeJobId: "job-1", jobs: {} });
  });

  it("clears workflow stores and navigates to the new generation workspace", () => {
    const navigate = vi.fn();
    startNewGeneration(navigate);

    expect(useUploadStore.getState().upload).toBeNull();
    expect(useGenerationStore.getState().generationId).toBeNull();
    expect(useJobStore.getState().activeJobId).toBeNull();
    expect(navigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("resetActiveGenerationSession clears in-memory workflow state", () => {
    resetActiveGenerationSession();

    expect(useUploadStore.getState().upload).toBeNull();
    expect(useGenerationStore.getState().generationId).toBeNull();
    expect(useJobStore.getState().activeJobId).toBeNull();
  });
});
