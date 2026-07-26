/**
 * CodeSandbox analytics/beacon endpoints. Failures here must not block preview,
 * validation, export, or visual comparison.
 */
const TELEMETRY_HOSTS = ["col.csbops.io", "csbops.io"];

const BUNDLER_HOST_HINTS = [
  "sandpack-bundler",
  "sandpack-static-server",
  "codesandbox.io",
  "csb.app",
];

export function isSandpackTelemetryUrl(url: string): boolean {
  try {
    const hostname = new URL(url, window.location.href).hostname.toLowerCase();
    return TELEMETRY_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  } catch {
    return false;
  }
}

export function isSandpackBundlerUrl(url: string): boolean {
  try {
    const hostname = new URL(url, window.location.href).hostname.toLowerCase();
    return BUNDLER_HOST_HINTS.some((hint) => hostname.includes(hint));
  } catch {
    return false;
  }
}
