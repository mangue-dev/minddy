/**
 * Merge of the palette's cross-project index with the current project's own,
 * fresher caches (MIN-91).
 *
 * The index (GET /api/me/search-index) is a snapshot: it can be up to
 * SEARCH_INDEX_STALE_MS old, and realtime can't keep it live for projects the
 * user isn't looking at (lib/realtime-provider.tsx only listens on the user
 * topic and the project in the URL). Where the user *is* — the current project —
 * `["issues", projectId]` / `["objectives", projectId]` are exact: kept fresh by
 * realtime and patched optimistically by every write surface.
 *
 * So the current project's rows REPLACE the index's rows for that project,
 * wholesale rather than field by field: that way a ticket created since the
 * snapshot appears, and one deleted since disappears — a per-row upsert would
 * get the first case right and the second wrong.
 *
 * The result is also the display order: current project first (what the user is
 * working on), then the other projects as the index ordered them
 * (`updated_at desc`). Search reorders by relevance anyway — this is what the
 * list looks like with an empty query.
 */

/** Minimum a row needs to be merged: its identity and its project. */
interface ProjectScopedRow {
  id: string;
  project_id: string;
}

export function mergeByProject<T extends ProjectScopedRow>(
  indexRows: T[],
  projectId: string | null,
  freshRows: T[] | null | undefined
): T[] {
  if (!projectId || !freshRows) return indexRows;
  const others = indexRows.filter((row) => row.project_id !== projectId);
  return [...freshRows, ...others];
}
