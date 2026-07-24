import { ErrorCode } from "@reactify/shared";

export class PersistenceError extends Error {
  constructor(
    message: string,
    readonly code: typeof ErrorCode.DATABASE_UNAVAILABLE | typeof ErrorCode.DATABASE_QUERY_FAILED | typeof ErrorCode.DATABASE_TRANSACTION_FAILED | typeof ErrorCode.PERSISTED_DATA_INVALID | typeof ErrorCode.PROJECT_VERSION_CORRUPTED | typeof ErrorCode.CONCURRENT_MODIFICATION | typeof ErrorCode.ARTIFACT_NOT_FOUND,
  ) {
    super(message);
    this.name = "PersistenceError";
  }
}

export function mapPrismaError(error: unknown): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  const message = error instanceof Error ? error.message : "Database operation failed.";
  if (/connect|connection|ECONNREFUSED|timeout/i.test(message)) {
    return new PersistenceError("Database is unavailable.", ErrorCode.DATABASE_UNAVAILABLE);
  }

  if (/unique constraint|P2002/i.test(message)) {
    return new PersistenceError("Concurrent modification detected.", ErrorCode.CONCURRENT_MODIFICATION);
  }

  return new PersistenceError("Database query failed.", ErrorCode.DATABASE_QUERY_FAILED);
}
