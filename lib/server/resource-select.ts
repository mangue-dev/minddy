import "server-only";

/**
 * What an entity's `resources` routes read: the entire line, plus the
 * PAGE it references when it is one (MIN-275).
 *
 * The title of a page is not stored in the resource — it resolves to the
 * reading, exactly like the subpage block of a document
 * does (components/pages/pages-lookup.tsx). Otherwise, renaming a page would leave its
 * old name on all tickets that cite it. A SERVER join rather
 * than one more client request: the sidebar of a ticket has no reason to
 * load the project page tree to display a pill.
 *
 * Read with the SESSION client, therefore under the policy `pages_select`, which excludes
 * trashed pages: a trashed page goes back down to `page: null`, and
 * this is what makes the pill inert without any code taking care of the
 * trash.
 */
export const RESOURCE_SELECT = "*, page:pages(id, title, icon)";

/** The attached page of a resource row. */
export interface JoinedPage {
  id: string;
  title: string;
  icon?: string | null;
  /** Present when reading is done in SERVICE key, which ignores the policy
 excluding trashed bins: this is then the only way to distinguish them. */
  deleted_at?: string | null;
}

/**
 * The attached page, regardless of the form it arrives in.
 *
 * `page_id` is a simple foreign key, so PostgREST renders an OBJECT — but
 * without generated schema types, postgrest-js types everything embed as one array.
 * This normalizer avoids writing the same `as unknown as` in all four
 * readers (routes, issue-reads, MCP, agent), with the risk that a single se
 * will fail the day PostgREST would really render a list.
 */
export function joinedPage(value: unknown): JoinedPage | null {
  if (!value) return null;
  const row = Array.isArray(value) ? (value[0] ?? null) : value;
  return (row as JoinedPage | null) ?? null;
}

/**
 * A resource such as an AGENT reads it — three forms, one per `kind`.
 *
 * Written once because it is read by multiple surfaces (the ticket in
 * issue-reads, the chat goals) and a model learns the form that we
 * show him: two readers who name the same field `title` on one side and
 * `file_name` on the other make him write different code twice for the
 * same thing.
 *
 * Which is NOT there, intentionally: the content of a file. Its
 * bytes remain behind the app's signed URL gate; here we only say its
 * name, its type and its size.
 *
 * The title of a PAGE comes from the join, not from the line: this is what makes
 * that a renamed page is also renamed wherever it is cited. `page_in_trash`
 * only appears on read SERVICE — at the session client, a trashed page
 * simply does not come back down.
 */
export function resourceSummary(row: {
  id: unknown;
  kind: unknown;
  url?: unknown;
  page_id?: unknown;
  file_name?: unknown;
  mime_type?: unknown;
  size_bytes?: unknown;
  page?: unknown;
}): Record<string, unknown> {
  if (row.kind === "link") {
    return { id: row.id, kind: "link", url: row.url, title: row.file_name };
  }
  if (row.kind === "page") {
    const page = joinedPage(row.page);
    return {
      id: row.id,
      kind: "page",
      page_id: row.page_id,
      title: page?.title?.trim() || row.file_name,
      ...(page?.deleted_at ? { page_in_trash: true } : {}),
    };
  }
  return {
    id: row.id,
    kind: "file",
    file_name: row.file_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
  };
}
