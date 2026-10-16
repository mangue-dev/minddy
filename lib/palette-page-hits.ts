import type { PageSearchHit, SearchIndexPage } from "./types";

interface PaletteRow {
  entityType?: string;
  data?: unknown;
  description?: string;
}

/**
 * Applies page content hits (MIN-276) to an already mapped palette model.
 *
 * Titles come from the index; content hits only add the excerpt that explains
 * why a page matches. The excerpt goes in `description`, so the engine still
 * ranks a title match above a body match. A page found by its content but
 * missing from the index (ceiling reached, stale snapshot) is appended through
 * `extra`, since the server just confirmed that it exists.
 *
 * Every row that is not a matching page keeps its reference: a hit arriving
 * while typing must not rebuild thousands of ticket rows.
 */
export function withPageContentHits<T extends PaletteRow>(
  rows: T[],
  hits: readonly PageSearchHit[],
  extra: (page: SearchIndexPage) => T | null,
): T[] {
  if (hits.length === 0) return rows;
  const excerptById = new Map(hits.map((hit) => [hit.id, hit.excerpt] as const));
  const known = new Set<string>();
  const next = rows.map((row) => {
    if (row.entityType !== "page") return row;
    const id = (row.data as { id?: string } | undefined)?.id;
    if (!id) return row;
    known.add(id);
    const excerpt = excerptById.get(id);
    return excerpt ? { ...row, description: excerpt } : row;
  });
  for (const hit of hits) {
    if (known.has(hit.id)) continue;
    const row = extra({
      id: hit.id,
      project_id: hit.project_id,
      title: hit.title,
      icon: hit.icon,
      updated_at: hit.updated_at,
    });
    if (row) next.push(row);
  }
  return next;
}
