import "server-only";

import { issueIdentifier } from "@/lib/issue-constants";
import type { PageBacklink } from "@/lib/types";
import { decodeIssue } from "@/lib/server/issue-store";
import { decodeObjective } from "@/lib/server/objective-store";
import { decodePageProjection } from "@/lib/server/page-content";

export type { PageBacklink };

/**
 * Find sources that cite a page through either an attachment resource
 * (`attachments.page_id`) or a text mention indexed in `page_links`.
 * Merge duplicate sources so both the page UI and `minddy_get_page` show
 * the same dependency list. The caller's client enforces RLS; service-client
 * callers must authorize page access before invoking this helper.
 */

type Rows = { data: unknown; error: { message: string } | null };

/**
 * Minimal PostgREST surface used by this module. Callers adapt their client
 * to avoid excessive type instantiation without generated schema types.
 */
export interface BacklinkQueryable {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => PromiseLike<Rows>;
      in: (column: string, values: unknown[]) => PromiseLike<Rows>;
    };
  };
}

/** A source reference before its protected title is resolved. */
interface RawSource {
  kind: PageBacklink["kind"];
  id: string;
  at: string;
}

/** Display concrete resources before page mentions. */
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

  if (links.error) console.error("[page-backlinks] links query failed");
  if (resources.error) {
    console.error("[page-backlinks] resources query failed");
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
    // The attachments_parent_ck constraint permits an issue or objective,
    // but not both, as the resource parent.
    if (row.issue_id) raw.push({ kind: "issue", id: row.issue_id, at: row.created_at });
    else if (row.objective_id) {
      raw.push({ kind: "objective", id: row.objective_id, at: row.created_at });
    }
  }

  // Preserve the oldest citation time when both sources refer to the page.
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
    fetchIn(client, "issues", "id, project_id, number, title, description, plan, remote_url, automation_override, deleted_at, encrypted_content, encryption_version", idsOf("issue")),
    fetchIn(client, "objectives", "id, project_id, name, description, color, deleted_at, encrypted_content, encryption_version", idsOf("objective")),
    fetchIn(client, "pages", "id, project_id, title, icon, deleted_at, encrypted_content, encryption_version", idsOf("page")),
  ])) as [Rows, Rows, Rows];

  const named = new Map<string, Omit<PageBacklink, "at">>();
  for (const stored of (issues.data ?? []) as {
    id: string;
    project_id: string;
    number: number;
    title: string | null;
    deleted_at: string | null;
  }[]) {
    if (stored.deleted_at) continue;
    const row = await decodeIssue(stored as unknown as Record<string, unknown>);
    named.set(`issue:${row.id}`, {
      kind: "issue",
      id: row.id as string,
      identifier: issueIdentifier(projectKey, row.number as number),
      title: row.title as string,
      icon: null,
      color: null,
    });
  }
  for (const stored of (objectives.data ?? []) as {
    id: string;
    project_id: string;
    name: string | null;
    color: string | null;
    deleted_at: string | null;
  }[]) {
    if (stored.deleted_at) continue;
    const row = await decodeObjective(stored as unknown as Record<string, unknown>);
    named.set(`objective:${row.id}`, {
      kind: "objective",
      id: row.id as string,
      identifier: null,
      title: row.name as string,
      icon: null,
      color: row.color as string | null,
    });
  }
  for (const stored of (pages.data ?? []) as {
    id: string;
    project_id: string;
    title: string | null;
    icon: string | null;
    deleted_at: string | null;
  }[]) {
    if (stored.deleted_at) continue;
    const row = await decodePageProjection(stored as unknown as Record<string, unknown>);
    named.set(`page:${row.id}`, {
      kind: "page",
      id: row.id as string,
      identifier: null,
      title: row.title as string,
      icon: row.icon as string | null,
      color: null,
    });
  }

  // Omit deleted or purged sources; page_links.source_id has no foreign key.
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

/** Avoid a PostgREST query when there are no source IDs. */
function fetchIn(
  client: BacklinkQueryable,
  table: string,
  columns: string,
  ids: string[]
): unknown {
  if (ids.length === 0) return Promise.resolve({ data: [], error: null });
  return client.from(table).select(columns).in("id", ids);
}
