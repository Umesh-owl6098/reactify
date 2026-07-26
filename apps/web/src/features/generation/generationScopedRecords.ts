/**
 * Defence in depth for generation-scoped history lists.
 *
 * Every generation-scoped store in this app is a module-level singleton, so a
 * late response, a missed reset, or a server-side filtering mistake can put one
 * generation's records in front of another generation. Route remounting and the
 * stale-scope guard in `useGenerationScopedFetch` should both prevent that, but
 * neither is visible at the point where records are rendered. Filtering here
 * means a mismatched record can never reach the screen regardless of how it got
 * into the store.
 */
export interface GenerationScopedRecord {
  generationId: string;
}

export function keepGenerationRecords<T extends GenerationScopedRecord>(
  records: readonly T[] | null | undefined,
  generationId: string | null | undefined,
): T[] {
  if (!records) {
    return [];
  }

  if (!generationId) {
    return [];
  }

  return records.filter((record) => record.generationId === generationId);
}

export function keepGenerationRecord<T extends GenerationScopedRecord>(
  record: T | null | undefined,
  generationId: string | null | undefined,
): T | null {
  if (!record || !generationId) {
    return null;
  }

  return record.generationId === generationId ? record : null;
}
