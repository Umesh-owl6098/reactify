const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function containsInvalidEmailCharacters(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export function normalizeEmail(email: string): { ok: true; email: string; normalizedEmail: string } | { ok: false; message: string } {
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) {
    return { ok: false, message: "Email address is invalid." };
  }
  if (containsInvalidEmailCharacters(trimmed)) {
    return { ok: false, message: "Email address contains invalid characters." };
  }
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex <= 0) {
    return { ok: false, message: "Email address is invalid." };
  }
  const localPart = trimmed.slice(0, atIndex);
  const domainPart = trimmed.slice(atIndex + 1).toLowerCase();
  const normalizedEmail = `${localPart}@${domainPart}`;
  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return { ok: false, message: "Email address is invalid." };
  }
  return { ok: true, email: trimmed, normalizedEmail };
}
