// Command palette favorites (starred items). Stored in the account's Supabase
// auth `user_metadata.palette_favorites` — the same mechanism as
// `prompt_copy_auto_start` / `auto_assign_created`, so they persist in the DB
// and sync across devices (not device-local like the package's localStorage
// default). Server-safe: no React/lucide imports.

export const PALETTE_FAVORITES_META_KEY = "palette_favorites";

/** Read the palette's favorite item ids from the user's auth user_metadata. */
export function resolvePaletteFavorites(
  meta: Record<string, unknown> | null | undefined
): string[] {
  const raw = meta?.[PALETTE_FAVORITES_META_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string");
}

/** Toggle an id in a favorites list (pure — for the optimistic update). */
export function togglePaletteFavorite(
  favorites: string[],
  id: string
): string[] {
  return favorites.includes(id)
    ? favorites.filter((x) => x !== id)
    : [...favorites, id];
}
