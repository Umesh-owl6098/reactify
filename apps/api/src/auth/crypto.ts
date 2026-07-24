import { createHash, timingSafeEqual } from "node:crypto";

export function hashValue(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export function hashSessionToken(token: string): string {
  return hashValue(token);
}

export function hashEmail(normalizedEmail: string): string {
  return hashValue(normalizedEmail);
}

export function hashIp(ip: string | undefined): string | undefined {
  if (!ip) {
    return undefined;
  }
  return hashValue(ip);
}

export function hashUserAgent(userAgent: string | undefined): string | undefined {
  if (!userAgent) {
    return undefined;
  }
  return hashValue(userAgent.slice(0, 512));
}
