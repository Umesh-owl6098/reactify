import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createProjectEdit,
  GenerationApiRequestError,
  submitSandboxValidation,
} from "./generation-api";

const generationId = "550e8400-e29b-41d4-a716-446655440000";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createProjectEdit response shapes", () => {
  const editSummary = {
    editId: "650e8400-e29b-41d4-a716-446655440001",
    generationId,
    status: "analyzing",
    instruction: "Increase the heading size.",
    sourceVersionId: "version-1",
    projectHashBefore: "1234567890abcdef",
    changedFiles: [],
    createdAt: new Date().toISOString(),
  };

  it("parses the async worker 202 envelope { edit, job }", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            edit: editSummary,
            job: { jobId: "750e8400-e29b-41d4-a716-446655440002", status: "pending" },
          }),
          { status: 202 },
        ),
      ),
    );

    const edit = await createProjectEdit(generationId, {
      instruction: "Increase the heading size.",
      expectedProjectHash: "1234567890abcdef",
    });
    expect(edit.editId).toBe(editSummary.editId);
    expect(edit.status).toBe("analyzing");
  });

  it("parses the inline 201 bare summary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(editSummary), { status: 201 })),
    );

    const edit = await createProjectEdit(generationId, {
      instruction: "Increase the heading size.",
      expectedProjectHash: "1234567890abcdef",
    });
    expect(edit.editId).toBe(editSummary.editId);
  });
});

describe("generation action API errors", () => {
  it("uses the backend sandbox validation error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "PROJECT_HASH_MISMATCH",
              message: "The preview is stale. Refresh and try again.",
              requestId: "request-safe",
            },
          }),
          { status: 409 },
        ),
      ),
    );

    await expect(
      submitSandboxValidation(generationId, {
        generationId,
        projectHash: "1234567890abcdef",
        compilation: { success: true, durationMs: 1, errors: [], warnings: [] },
        runtime: { success: true, durationMs: 1, errors: [], warnings: [] },
        validatedAt: new Date().toISOString(),
      }),
    ).rejects.toMatchObject({
      name: "GenerationApiRequestError",
      code: "PROJECT_HASH_MISMATCH",
      message: "The preview is stale. Refresh and try again.",
      status: 409,
    });
  });

  it("uses the backend edit error instead of generic copy", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: "EDIT_NOT_ALLOWED",
              message: "Run sandbox validation before editing.",
              requestId: "request-safe",
            },
          }),
          { status: 409 },
        ),
      ),
    );

    await expect(
      createProjectEdit(generationId, {
        instruction: "Increase the heading size.",
        expectedProjectHash: "1234567890abcdef",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GenerationApiRequestError>>({
        code: "EDIT_NOT_ALLOWED",
        message: "Run sandbox validation before editing.",
        status: 409,
      }),
    );
  });
});
