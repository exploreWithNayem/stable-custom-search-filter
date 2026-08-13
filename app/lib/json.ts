/**
 * Helpers for the stringified-JSON columns described in CLAUDE.md D5.
 *
 * SQLite has no `Json` scalar, so config blobs live in `String` columns. These
 * helpers keep parsing total: a corrupt or legacy value degrades to the caller's
 * fallback instead of throwing inside a loader.
 */

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || parsed === undefined) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function parseJsonObject<T extends Record<string, unknown>>(
  raw: string | null | undefined,
  fallback: T,
): T {
  const parsed = parseJson<unknown>(raw, fallback);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return fallback;
  }
  return { ...fallback, ...(parsed as T) };
}

export function parseJsonArray<T>(raw: string | null | undefined): T[] {
  const parsed = parseJson<unknown>(raw, []);
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}
