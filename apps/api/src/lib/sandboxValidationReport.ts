import type { Diagnostic, SandboxValidationRequest } from "@reactify/generation-contracts";
import { SandboxValidationRequestSchema } from "@reactify/generation-contracts";
import { ErrorCode } from "@reactify/shared";

const MAX_DIAGNOSTICS = 100;
const MAX_MESSAGE_LENGTH = 2000;
const MAX_STACK_LENGTH = 4000;

const SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{10,}/,
  /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
  /authorization\s*[:=]\s*["'][^"']+["']/i,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/i,
];

export interface NormalizedSandboxReport {
  request: SandboxValidationRequest;
  reportFingerprint: string;
}

export interface SandboxReportValidationFailure {
  ok: false;
  errorCode:
    | typeof ErrorCode.SANDBOX_REPORT_INVALID
    | typeof ErrorCode.REPORT_TOO_LARGE;
  message: string;
}

export type SandboxReportValidationResult =
  | { ok: true; report: NormalizedSandboxReport }
  | SandboxReportValidationFailure;

function sanitizeDiagnostic(diagnostic: Diagnostic): Diagnostic {
  let message = diagnostic.message.slice(0, MAX_MESSAGE_LENGTH);
  let stack = diagnostic.stack?.slice(0, MAX_STACK_LENGTH);

  for (const pattern of SECRET_PATTERNS) {
    message = message.replace(pattern, "[redacted]");
    stack = stack?.replace(pattern, "[redacted]");
  }

  message = message.replace(/\/Users\/[^\s]+/g, "[path]");
  message = message.replace(/\/home\/[^\s]+/g, "[path]");
  stack = stack?.replace(/\/Users\/[^\s]+/g, "[path]");
  stack = stack?.replace(/\/home\/[^\s]+/g, "[path]");

  return {
    ...diagnostic,
    message,
    stack,
  };
}

function limitDiagnostics(diagnostics: Diagnostic[]): Diagnostic[] {
  return diagnostics.slice(0, MAX_DIAGNOSTICS).map(sanitizeDiagnostic);
}

export function validateSandboxValidationReport(
  body: unknown,
  routeGenerationId: string,
): SandboxReportValidationResult {
  const parsed = SandboxValidationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      errorCode: ErrorCode.SANDBOX_REPORT_INVALID,
      message: "Sandbox validation report failed schema validation.",
    };
  }

  if (parsed.data.generationId !== routeGenerationId) {
    return {
      ok: false,
      errorCode: ErrorCode.SANDBOX_REPORT_INVALID,
      message: "Sandbox validation report generationId does not match route.",
    };
  }

  const totalDiagnostics =
    parsed.data.compilation.errors.length +
    parsed.data.compilation.warnings.length +
    parsed.data.runtime.errors.length +
    parsed.data.runtime.warnings.length;

  if (totalDiagnostics > MAX_DIAGNOSTICS * 4) {
    return {
      ok: false,
      errorCode: ErrorCode.REPORT_TOO_LARGE,
      message: "Sandbox validation report exceeds diagnostic limits.",
    };
  }

  const request: SandboxValidationRequest = {
    ...parsed.data,
    compilation: {
      ...parsed.data.compilation,
      errors: limitDiagnostics(parsed.data.compilation.errors),
      warnings: limitDiagnostics(parsed.data.compilation.warnings),
    },
    runtime: {
      ...parsed.data.runtime,
      errors: limitDiagnostics(parsed.data.runtime.errors),
      warnings: limitDiagnostics(parsed.data.runtime.warnings),
    },
  };

  const reportFingerprint = JSON.stringify({
    generationId: request.generationId,
    projectHash: request.projectHash,
    compilation: request.compilation,
    runtime: request.runtime,
    validatedAt: request.validatedAt,
  });

  return {
    ok: true,
    report: {
      request,
      reportFingerprint,
    },
  };
}
