export function serializeError(error: unknown): {
  name?: string;
  message: string;
  stack?: string;
  code?: string;
} {
  if (error instanceof Error) {
    const code =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? (error as { code: string }).code
        : undefined;
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code,
    };
  }

  return { message: String(error) };
}

export function logEvent(event: string, fields?: Record<string, unknown>): void {
  console.info({ event, ...fields });
}

export function logWarn(event: string, fields?: Record<string, unknown>): void {
  console.warn({ event, ...fields });
}

export function logError(event: string, error: unknown, fields?: Record<string, unknown>): void {
  console.error({ event, ...fields, error: serializeError(error) });
}
