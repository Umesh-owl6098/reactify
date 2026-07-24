import { describe, expect, it } from "vitest";
import {
  GenerationApiRequestError,
  mapGenerationLoadError,
} from "./generation-api";

describe("mapGenerationLoadError", () => {
  it("maps authentication failures to session-expired copy", () => {
    expect(
      mapGenerationLoadError(
        new GenerationApiRequestError("Authentication required.", "AUTHENTICATION_REQUIRED", 401),
        "fallback",
      ),
    ).toBe("Your session has expired. Sign in again to view this generation.");
  });

  it("maps not-found failures", () => {
    expect(
      mapGenerationLoadError(
        new GenerationApiRequestError("Generation not found.", "GENERATION_NOT_FOUND", 404),
        "fallback",
      ),
    ).toBe("Generation not found.");
  });

  it("maps API unavailable failures", () => {
    expect(
      mapGenerationLoadError(
        new GenerationApiRequestError("The API server is unavailable.", "DATABASE_UNAVAILABLE", 503),
        "fallback",
      ),
    ).toBe("The API server is unavailable.");
  });

  it("maps invalid persisted generation data", () => {
    expect(
      mapGenerationLoadError(
        new GenerationApiRequestError("Persisted generation data is invalid.", "GENERATION_DATA_INVALID"),
        "fallback",
      ),
    ).toBe("Persisted generation data is invalid.");
  });
});
