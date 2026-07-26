/** Default CodeSandbox-hosted Sandpack bundler (runtime compile/preview service). */
export const DEFAULT_SANDPACK_BUNDLER_URL = "https://sandpack-bundler.codesandbox.io";

/**
 * Resolve the Sandpack bundler URL from env for self-hosted/local development.
 * Set VITE_SANDPACK_BUNDLER_URL to override (e.g. http://127.0.0.1:4587).
 */
export function getSandpackBundlerUrl(): string {
  const configured = import.meta.env.VITE_SANDPACK_BUNDLER_URL?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_SANDPACK_BUNDLER_URL;
}

export const SANDPACK_BUNDLER_CONNECTION_TIMEOUT_MS = 45_000;
