import { createHash } from "node:crypto";
import type { Env } from "../env.js";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export class AuthRateLimiter {
  private readonly entries = new Map<string, RateLimitEntry>();

  constructor(private readonly env: Env) {}

  private key(scope: string, parts: string[]): string {
    return createHash("sha256").update([scope, ...parts].join(":")).digest("hex");
  }

  check(scope: string, parts: string[]): boolean {
    const now = Date.now();
    const entryKey = this.key(scope, parts);
    const existing = this.entries.get(entryKey);
    if (!existing || existing.resetAt <= now) {
      this.entries.set(entryKey, {
        count: 1,
        resetAt: now + this.env.AUTH_RATE_LIMIT_WINDOW_MS,
      });
      return true;
    }
    if (existing.count >= this.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS) {
      return false;
    }
    existing.count += 1;
    return true;
  }
}
