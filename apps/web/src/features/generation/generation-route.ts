export function generationDetailPath(generationId: string): string {
  return `/generations/${encodeURIComponent(generationId)}`;
}

export function isGenerationStatusForRoute(
  status: { id: string } | null | undefined,
  generationId: string | undefined,
): boolean {
  return Boolean(status && generationId && status.id === generationId);
}
