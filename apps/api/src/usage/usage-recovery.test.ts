import { describe, expect, it } from "vitest";
import { recoverExpiredReservations } from "./usage-recovery.js";

describe("recoverExpiredReservations", () => {
  it("returns zero when usage tables are not migrated yet", async () => {
    const recovered = await recoverExpiredReservations({
      findExpiredActiveReservations: async () => {
        const error = new Error("Table does not exist");
        (error as { code?: string }).code = "P2021";
        throw error;
      },
    } as never);

    expect(recovered).toBe(0);
  });
});
