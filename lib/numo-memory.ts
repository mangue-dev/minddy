/**
 * Numo's memory (MIN-915): the limits shared by the server repository, the
 * Numo tools and the settings screen.
 */

/** Memories one user can keep. Past it, Numo must replace or forget one. */
export const NUMO_MEMORY_LIMIT = 100;

/** Characters in one memory. */
export const NUMO_MEMORY_MAX_LENGTH = 1000;

/** `user_metadata` key of the "Let Numo remember things" switch (on by default). */
export const NUMO_MEMORY_META_KEY = "numo_memory";

export function resolveNumoMemoryEnabled(
  meta: Record<string, unknown> | null | undefined,
): boolean {
  return meta?.[NUMO_MEMORY_META_KEY] !== false;
}

/**
 * The stored form of a memory: trimmed, with runs of blank space collapsed
 * to one space, since a memory is one statement. Null when empty or too long.
 */
export function normalizeNumoMemoryContent(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > NUMO_MEMORY_MAX_LENGTH) return null;
  return text;
}
