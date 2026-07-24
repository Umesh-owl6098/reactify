import { describe, expect, it } from "vitest";
import { parseDatabaseIdentity } from "./database-identity.js";

describe("parseDatabaseIdentity", () => {
  it("hashes host information without exposing credentials", () => {
    const identity = parseDatabaseIdentity("postgresql://reactify:secret@localhost:5434/reactify");

    expect(identity.databaseName).toBe("reactify");
    expect(identity.databaseHostHash).toHaveLength(12);
    expect(identity.databaseHostHash).not.toContain("secret");
    expect(identity.databaseHostHash).not.toContain("reactify");
  });
});
