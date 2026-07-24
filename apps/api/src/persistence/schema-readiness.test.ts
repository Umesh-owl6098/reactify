import { describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { verifySchemaReadiness } from "./schema-readiness.js";
import { testEnv } from "../test/helpers.js";

describe("verifySchemaReadiness", () => {
  it("reports database connectivity", async () => {
    const prisma = new PrismaClient({
      datasources: { db: { url: testEnv.DATABASE_URL } },
    });

    const result = await verifySchemaReadiness(prisma);
    expect(result.databaseConnected).toBe(true);
    await prisma.$disconnect();
  });
});
