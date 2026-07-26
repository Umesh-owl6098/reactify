import { ErrorCode } from "@reactify/shared";

type PersistenceErrorCode =
  | typeof ErrorCode.DATABASE_UNAVAILABLE
  | typeof ErrorCode.DATABASE_SCHEMA_MISSING
  | typeof ErrorCode.DATABASE_QUERY_FAILED
  | typeof ErrorCode.DATABASE_TRANSACTION_FAILED
  | typeof ErrorCode.GENERATION_PERSIST_FAILED
  | typeof ErrorCode.JOB_ENQUEUE_FAILED
  | typeof ErrorCode.PERSISTED_DATA_INVALID
  | typeof ErrorCode.PROJECT_VERSION_CORRUPTED
  | typeof ErrorCode.CONCURRENT_MODIFICATION
  | typeof ErrorCode.ARTIFACT_NOT_FOUND;

export class PersistenceError extends Error {
  readonly prismaCode?: string;
  readonly modelName?: string;
  readonly constraintName?: string;

  constructor(
    message: string,
    readonly code: PersistenceErrorCode,
    details?: { prismaCode?: string; modelName?: string; constraintName?: string; cause?: unknown },
  ) {
    super(message, details?.cause === undefined ? undefined : { cause: details.cause });
    this.name = "PersistenceError";
    this.prismaCode = details?.prismaCode;
    this.modelName = details?.modelName;
    this.constraintName = details?.constraintName;
  }
}

export interface PrismaErrorDetails {
  prismaCode?: string;
  modelName?: string;
  constraintName?: string;
  message: string;
}

export function getPrismaErrorDetails(error: unknown): PrismaErrorDetails {
  if (typeof error !== "object" || error === null) {
    return { message: "Database operation failed." };
  }

  const record = error as {
    code?: string;
    message?: string;
    meta?: { modelName?: string; constraint?: string };
  };

  return {
    prismaCode: record.code,
    modelName: record.meta?.modelName,
    constraintName: record.meta?.constraint,
    message: record.message ?? "Database operation failed.",
  };
}

export function mapPrismaError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  const details = getPrismaErrorDetails(error);

  if (details.prismaCode === "P2021") {
    return new PersistenceError(
      "Database migrations are incomplete. Run pnpm db:migrate or pnpm db:deploy.",
      ErrorCode.DATABASE_SCHEMA_MISSING,
      {
        prismaCode: details.prismaCode,
        modelName: details.modelName,
        constraintName: details.constraintName,
      },
    );
  }

  if (details.prismaCode === "P2003") {
    return new PersistenceError(
      "A related database record required for this operation is missing.",
      ErrorCode.DATABASE_QUERY_FAILED,
      {
        prismaCode: details.prismaCode,
        modelName: details.modelName,
        constraintName: details.constraintName,
      },
    );
  }

  if (details.prismaCode === "P1001" || details.prismaCode === "P1002" || details.prismaCode === "P1017") {
    return new PersistenceError("Database is unavailable.", ErrorCode.DATABASE_UNAVAILABLE, {
      prismaCode: details.prismaCode,
      modelName: details.modelName,
      constraintName: details.constraintName,
    });
  }

  if (/connect|connection|ECONNREFUSED|timeout/i.test(details.message)) {
    return new PersistenceError("Database is unavailable.", ErrorCode.DATABASE_UNAVAILABLE, {
      prismaCode: details.prismaCode,
      modelName: details.modelName,
      constraintName: details.constraintName,
    });
  }

  if (/unique constraint|P2002/i.test(details.message)) {
    return new PersistenceError("Concurrent modification detected.", ErrorCode.CONCURRENT_MODIFICATION, {
      prismaCode: details.prismaCode,
      modelName: details.modelName,
      constraintName: details.constraintName,
    });
  }

  // Nothing matched, so the message is the only remaining clue about what went
  // wrong; keep the original error attached rather than discarding it.
  return new PersistenceError("Database query failed.", ErrorCode.DATABASE_QUERY_FAILED, {
    prismaCode: details.prismaCode,
    modelName: details.modelName,
    constraintName: details.constraintName,
    cause: error,
  });
}

/** Maps Prisma failures from BackgroundJob enqueue into safe API-facing errors. */
export function mapJobEnqueueError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  const details = getPrismaErrorDetails(error);

  if (details.prismaCode === "P2021") {
    return new PersistenceError(
      "Background job queue is unavailable until database migrations are applied.",
      ErrorCode.DATABASE_SCHEMA_MISSING,
      {
        prismaCode: details.prismaCode,
        modelName: details.modelName,
        constraintName: details.constraintName,
      },
    );
  }

  if (details.prismaCode === "P2003") {
    return new PersistenceError(
      "Design analysis could not be queued because the generation record is not persisted yet.",
      ErrorCode.JOB_ENQUEUE_FAILED,
      {
        prismaCode: details.prismaCode,
        modelName: details.modelName,
        constraintName: details.constraintName,
      },
    );
  }

  const mapped = mapPrismaError(error);
  if (mapped.code === ErrorCode.DATABASE_QUERY_FAILED) {
    return new PersistenceError(mapped.message, ErrorCode.JOB_ENQUEUE_FAILED, {
      prismaCode: details.prismaCode,
      modelName: details.modelName,
      constraintName: details.constraintName,
    });
  }

  return mapped;
}

export function logJobEnqueueFailure(
  context: { generationId: string; requestId?: string },
  error: unknown,
): void {
  const details = getPrismaErrorDetails(error);
  console.error({
    event: "job_enqueue_failed",
    generationId: context.generationId,
    requestId: context.requestId,
    prismaCode: details.prismaCode,
    modelName: details.modelName,
    constraintName: details.constraintName,
  });
}
