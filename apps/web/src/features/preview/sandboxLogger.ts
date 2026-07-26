export function logSandbox(event: string, detail: Record<string, unknown> = {}): void {
  console.info(`[sandpack] ${event}`, detail);
}
