import { ErrorCode } from "@reactify/shared";
import { hash, verify } from "@node-rs/argon2";
import type { Env } from "../env.js";

export type PasswordValidationResult =
  | { ok: true }
  | {
      ok: false;
      code: typeof ErrorCode.INVALID_PASSWORD;
      message: string;
    };

function containsControlCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export class PasswordService {
  constructor(private readonly env: Env) {}

  validate(input: {
    password: string;
    normalizedEmail?: string;
    displayName?: string;
  }): PasswordValidationResult {
    if (input.password.length < 12) {
      return { ok: false, code: ErrorCode.INVALID_PASSWORD, message: "Password must be at least 12 characters." };
    }
    if (input.password.length > 256) {
      return { ok: false, code: ErrorCode.INVALID_PASSWORD, message: "Password is too long." };
    }
    if (containsControlCharacters(input.password)) {
      return { ok: false, code: ErrorCode.INVALID_PASSWORD, message: "Password contains invalid control characters." };
    }
    if (input.normalizedEmail && input.password.toLowerCase() === input.normalizedEmail) {
      return { ok: false, code: ErrorCode.INVALID_PASSWORD, message: "Password must not match your email address." };
    }
    if (
      input.displayName &&
      input.displayName.length >= 3 &&
      input.password.toLowerCase() === input.displayName.trim().toLowerCase()
    ) {
      return { ok: false, code: ErrorCode.INVALID_PASSWORD, message: "Password must not match your display name." };
    }
    return { ok: true };
  }

  async hashPassword(password: string): Promise<string> {
    return hash(password, {
      memoryCost: this.env.PASSWORD_HASH_MEMORY_COST,
      timeCost: this.env.PASSWORD_HASH_TIME_COST,
      parallelism: this.env.PASSWORD_HASH_PARALLELISM,
    });
  }

  async verifyPassword(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
