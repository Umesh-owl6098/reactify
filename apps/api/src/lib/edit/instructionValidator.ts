/* eslint-disable no-control-regex */
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const BLOCKED_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  // Block requests to expose secret values, not mere mentions — editing a
  // password input or a "forgot password" link is normal UI work.
  {
    pattern:
      /\b(?:show|reveal|print|output|display|expose|leak|include|embed|hardcode|insert)\b[^.?!]{0,60}\b(api[_-\s]?keys?|secrets?|passwords?|tokens?|credentials?)\b/i,
    message: "Instructions cannot request secrets or credentials.",
  },
  {
    pattern: /\b(api[_-\s]?key|access[_-\s]?token|client[_-\s]?secret)s?\s*[:=]/i,
    message: "Instructions cannot embed secrets or credentials.",
  },
  { pattern: /(?:^|\s)\.env\b|environment file/i, message: "Instructions cannot request environment files or secrets." },
  { pattern: /\b(rm\s+-rf|curl\s+|wget\s+|bash\s+|shell\s+command|execute\s+command)\b/i, message: "Instructions cannot request shell command execution." },
  { pattern: /\b(backend|server-side|express|fastify|database|sql)\b/i, message: "Instructions cannot request backend or server code." },
  { pattern: /\b(disable|bypass|skip)\s+(validation|security|scanner)\b/i, message: "Instructions cannot disable security validation." },
  { pattern: /\b(show|reveal|print|output)\s+(the\s+)?(prompt|system prompt|raw response)\b/i, message: "Instructions cannot request hidden prompt extraction." },
  { pattern: /\bignore (previous|all) instructions\b/i, message: "Instructions cannot attempt prompt injection." },
];

export interface InstructionValidationLimits {
  minLength: number;
  maxLength: number;
}

export function validateEditInstruction(
  instruction: string,
  limits: InstructionValidationLimits,
): { ok: true; normalized: string } | { ok: false; message: string } {
  const normalized = instruction.trim();

  if (!normalized) {
    return { ok: false, message: "Instruction cannot be empty." };
  }

  if (normalized.length < limits.minLength) {
    return { ok: false, message: "Instruction is too short to be useful." };
  }

  if (normalized.length > limits.maxLength) {
    return { ok: false, message: "Instruction exceeds maximum length." };
  }

  if (CONTROL_CHAR_PATTERN.test(normalized)) {
    return { ok: false, message: "Instruction contains invalid control characters." };
  }

  for (const rule of BLOCKED_PATTERNS) {
    if (rule.pattern.test(normalized)) {
      return { ok: false, message: rule.message };
    }
  }

  return { ok: true, normalized };
}
