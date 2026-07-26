import { describe, expect, it } from "vitest";
import { ErrorCode } from "@reactify/shared";
import { mapJobEnqueueError, mapPrismaError } from "./errors.js";

describe("mapPrismaError", () => {
  it("maps connection failures to DATABASE_UNAVAILABLE", () => {
    const error = Object.assign(new Error("Can't reach database server at localhost"), { code: "P1001" });
    expect(mapPrismaError(error).code).toBe(ErrorCode.DATABASE_UNAVAILABLE);
  });

  it("maps missing-table Prisma errors to DATABASE_SCHEMA_MISSING", () => {
    const error = Object.assign(
      new Error("The table `public.BackgroundJob` does not exist in the current database."),
      { code: "P2021", meta: { modelName: "BackgroundJob" } },
    );
    expect(mapPrismaError(error).code).toBe(ErrorCode.DATABASE_SCHEMA_MISSING);
  });

  it("maps foreign-key violations to DATABASE_QUERY_FAILED", () => {
    const error = Object.assign(
      new Error("Foreign key constraint violated on the constraint: `BackgroundJob_generationId_fkey`"),
      { code: "P2003", meta: { modelName: "BackgroundJob", constraint: "BackgroundJob_generationId_fkey" } },
    );
    expect(mapPrismaError(error).code).toBe(ErrorCode.DATABASE_QUERY_FAILED);
  });
});

describe("mapJobEnqueueError", () => {
  it("maps P2003 to JOB_ENQUEUE_FAILED", () => {
    const error = Object.assign(
      new Error("Foreign key constraint violated on the constraint: `BackgroundJob_generationId_fkey`"),
      { code: "P2003", meta: { modelName: "BackgroundJob", constraint: "BackgroundJob_generationId_fkey" } },
    );
    const mapped = mapJobEnqueueError(error);
    expect(mapped.code).toBe(ErrorCode.JOB_ENQUEUE_FAILED);
    expect(mapped.prismaCode).toBe("P2003");
    expect(mapped.constraintName).toBe("BackgroundJob_generationId_fkey");
  });

  it("maps P2021 to DATABASE_SCHEMA_MISSING", () => {
    const error = Object.assign(
      new Error("The table `public.BackgroundJob` does not exist in the current database."),
      { code: "P2021", meta: { modelName: "BackgroundJob" } },
    );
    expect(mapJobEnqueueError(error).code).toBe(ErrorCode.DATABASE_SCHEMA_MISSING);
  });
});
