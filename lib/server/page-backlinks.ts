import "server-only";

import { issueIdentifier } from "@/lib/issue-constants";
import type { PageBacklink } from "@/lib/types";

export type { PageBacklink };

/**
 * WHO cites this page — reading, by its two paths (MIN-279).
 *
 * Two origins, and they have nothing in common except the result:
 *
 * • the RESOURCE of genre `page` (MIN-275) — a real foreign key,
 * `attachments.page_id`, whose index had been set for this day;
 * • the MENTION — text, therefore nothing to query, hence the derived table
 * `page_links` than `lib/server/page-links.ts` rewritten on each write.
 *
 * The two merge: a source that cites the page both ways is one
 * line, not two. The sign responds to “who relies on this page?” " ;
 * how the quote is written is not the question.
 *
 * Written once because two surfaces read it, and they must
 * respond the same: the road sign, and `minddy_get_page` — the agent
 * who opens a spec must see the tickets that depend on it without searching for them.
 *
 * The CLIENT is that of the caller, and this is what carries access control.
 * At the session client, the four readings are filtered by the RLS; to the client
 * service (the MCP), they are not — and the guard was done before, in
 * TypeScript, by the core of the pages.
 */

type Rows = { data: unknown; error: { message: string } | null };

/**
 * The bare minimum of PostgREST this module needs — four `select` with
 * a filter each.
 *
 * Hand-described, and callers pass their client through a `as unknown as` :
 * without types generated schema, letting TypeScript infer `from()` to a real
 * `SupabaseClient` across this boundary blows up the instantiation
 * (TS2589), and the rendered typing is just a `any` in disguise anyway.
 */
export interface BacklinkQueryable {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => PromiseLike<Rows>;
      in: (column: string, values: unknown[]) => PromiseLike<Rows>;
    };
  };
}

/** A source, before we knew how to name it. */
interface RawSource {
  kind: PageBacklink["kind"];
  id: string;
  at: string;
}

/** L'ordre des genres, du plus concret au plus large. */
const KIND_ORDER: Record<PageBacklink["kind"], number> = {
  issue: 0,
  objective: 1,
  page: 2,
};

export async function pageBacklinks(
  client: BacklinkQueryable,
  { pageId, projectKey }: { pageId: string; projectKey: string }
): Promise<PageBacklink[]> {
  const [links, resources] = (await Promise.all([
    client.from("page_links").select("source_kind, source_id, created_at").eq("page_id", pageId),
    client
      .from("attachments")
      .select("issue_id, objective_id, created_at")
      .eq("page_id", pageId),
  ])) as [Rows, Rows];

  if (links.error) console.error("[page-backlinks] links failed:", links.error.message);
  if (resources.error) {
    console.error("[page-backlinks] resources failed:", resources.error.message);
  }

  const raw: RawSource[] = [];
  for (const row of (links.data ?? []) as {
    source_kind: PageBacklink["kind"];
    source_id: string;
    created_at: string;
  }[]) {
    raw.push({ kind: row.source_kind, id: row.source_id, at: row.created_at });
  }
  for (const row of (resources.data ?? []) as {
    issue_id: string | null;
    objective_id: string | null;
    created_at: string;
  }[]) {
    // A resource depends on a ticket OR an objective, never both
    // (`attachments_parent_ck`). A page does not yet bear one — the day when
    // she will carry some, it will be one more branch here and nothing else.
    if (row.issue_id) raw.push({ kind: "issue", id: row.issue_id, at: row.created_at });
    else if (row.objective_id) {
      raw.push({ kind: "objective", id: row.objective_id, at: row.created_at });
    }
  }

  // The FUSION of the two origins. The OLDEST of the two dates wins: it is
  // when this source started to rely on the page, and add the
  // resource of a ticket which already mentioned it must not bring it up
  // at the top as a novelty.
  const merged = new Map<string, RawSource>();
  for (const source of raw) {
    const key = `${source.kind}:${source.id}`;
    const seen = merged.get(key);
    if (!seen || source.at < seen.at) merged.set(key, source);
  }
  if (merged.size === 0) return [];

  const idsOf = (kind: PageBacklink["kind"]) =>
    [...merged.values()].filter((s) => s.kind === kind).map((s) => s.id);

  const [issues, objectives, pages] = (await Promise.all([
    fetchIn(client, "issues", "id, number, title, deleted_at", idsOf("issue")),
    fetchIn(client, "objectives", "id, name, color, deleted_at", idsOf("objective")),
    fetchIn(client, "pages", "id, title, icon, deleted_at", idsOf("page")),
  ])) as [Rows, Rows, Rows];

  const named = new Map<string, Omit<PageBacklink, "at">>();
  for (const row of (issues.data ?? []) as {
    id: string;
    number: number;
    title: string;
    deleted_at: string | null;
  }[]) {
    if (row.deleted_at) continue;
    named.set(`issue:${row.id}`, {
      kind: "issue",
      id: row.id,
      identifier: issueIdentifier(projectKey, row.number),
      title: row.title,
      icon: null,
      color: null,
    });
  }
  for (const row of (objectives.data ?? []) as {
    id: string;
    name: string;
    color: string | null;
    deleted_at: string | null;
  }[]) {
    if (row.deleted_at) continue;
    named.set(`objective:${row.id}`, {
      kind: "objective",
      id: row.id,
      identifier: null,
      title: row.name,
      icon: null,
      color: row.color,
    });
  }
  for (const row of (pages.data ?? []) as {
    id: string;
    title: string;
    icon: string | null;
    deleted_at: string | null;
  }[]) {
    if (row.deleted_at) continue;
    named.set(`page:${row.id}`, {
      kind: "page",
      id: row.id,
      identifier: null,
      title: row.title,
      icon: row.icon,
      color: null,
    });
  }

  // What is no longer resolved is SILENTLY abandoned: a source
  // trashed (the ticket went in the trash, we don't talk about it anymore), or
  // purged — `page_links.source_id` does not carry a foreign key, the line
  // survives at its source, and it is here that it ceases to exist.
  return [...merged.values()]
    .flatMap((source) => {
      const entry = named.get(`${source.kind}:${source.id}`);
      return entry ? [{ ...entry, at: source.at }] : [];
    })
    .sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)
    );
}

/** `.in(…)` on an empty list queries for nothing — we short-circuit. */
function fetchIn(
  client: BacklinkQueryable,
  table: string,
  columns: string,
  ids: string[]
): unknown {
  if (ids.length === 0) return Promise.resolve({ data: [], error: null });
  return client.from(table).select(columns).in("id", ids);
}
