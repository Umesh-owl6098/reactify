import { describe, expect, it } from "vitest";
import { DEFAULT_DEMO_USER_ID } from "@reactify/shared";
import { createDisabledAuthContext, disabledSessionResponse, isAuthDisabled } from "./auth-mode.js";
import { testEnv } from "../test/helpers.js";

describe("auth mode", () => {
  it("treats AUTH_MODE=disabled as unauthenticated-session bypass", () => {
    const env = { ...testEnv, AUTH_MODE: "disabled" as const };
    expect(isAuthDisabled(env)).toBe(true);
    expect(createDisabledAuthContext(env).user.id).toBe(DEFAULT_DEMO_USER_ID);
    expect(disabledSessionResponse(env).authenticated).toBe(true);
  });

  it("keeps AUTH_MODE=session as authenticated flow", () => {
    const env = { ...testEnv, AUTH_MODE: "session" as const };
    expect(isAuthDisabled(env)).toBe(false);
  });
});
