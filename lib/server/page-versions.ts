import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { resolveApiKeyActors } from "@/lib/server/api-key-actors";
import { displayName } from "@/lib/display-name";
import { SITE_NAME } from "@/lib/site";
import { updatePage, type PageErrorKey } from "@/lib/server/pages";
import type { Page, PageVersion, PageWriteKind } from "@/lib/pages";

/**
 * The HISTORY of a page (MIN-277): read previous states, return one.
 *
 * The agent's net, and that's what it is for: six writing tools
 * are open to Numo, the MCP and the code agent, and without this module the only
 * possible answer to "the agent overwrote my page" would be "there's nothing we can
 * do".
 *
 * What the table contains is decided elsewhere — `stampPageWrite`, in
 * lib/server/pages.ts, archives the state that each writing COVERS. Here we just
 * just return it, and put it back in place.
 *
 * Two choices that can be read in the signatures:
 *
 * 1. **a trashed page keeps its history searchable.** Reading
 * does not exclude `deleted_at` (the policy either, cf. migration): "it has
 * disappeared, goes back to before" is the gesture after the incident, not a case
 * twisted.
 * 2. **restore is a WRITING like any other.** It comes back by
 * `updatePage`, therefore by the gatekeeper, the `version` counter, the
 * search projection and archiving — the state before the restoration
 * is therefore itself archived, and a restoration takes place undone.
 */

type Service = ReturnType<typeof getServiceClient>;

/** LIST columns: everything except the body, for the same reason that
 `LIST_COLUMNS` on the page side — twenty ProseMirror documents for a list of
 dates would be the heaviest query on the screen. */
const VERSION_COLUMNS =
  "id, page_id, version, title, icon, author_id, author_kind, author_api_key_id, created_at";

export type PageVersionResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; errorKey: PageErrorKey };

/** The page (including trash) if the actor has access to it, otherwise nothing. */
async function reachable(
  service: Service,
  pageId: string,
  actorId: string
): Promise<Page | null> {
  const { data } = await service
    .from("pages")
    .select("id, project_id, title, icon, version, deleted_at")
    .eq("id", pageId)
    .maybeSingle();
  const page = (data as Page | null) ?? null;
  if (!page) return null;
  if (!(await getProjectAccess(actorId, page.project_id))) return null;
  return page;
}

type VersionRow = {
  id: string;
  page_id: string;
  version: number;
  title: string;
  icon: string | null;
  content?: unknown;
  author_id: string | null;
  author_kind: PageWriteKind;
  author_api_key_id?: string | null;
  created_at: string;
};

/**
 * The NAME of a version author, and this is where the identity rule of
 * minddy comes into play: human gesture = name of the human, automated gesture = name of minddy.
 *
 * An agent's writing nevertheless carries a `author_id` — that of the account who
 * allowed it. We don't read it: displaying this name would pass off as one's own a
 * text that no one wrote, which is exactly the trust incident
 * that this history exists to avoid.
 */
async function resolveAuthors(
  service: Service,
  rows: VersionRow[]
): Promise<Map<string, string>> {
  const humanIds = rows
    .filter((row) => row.author_kind !== "agent" && row.author_id)
    .map((row) => row.author_id as string);
  if (humanIds.length === 0) return new Map();

  const users = await fetchAuthUsersById(service, humanIds);
  const names = new Map<string, string>();
  for (const [id, user] of users) names.set(id, displayName(toNamed(user), ""));
  return names;
}

/**
 * WHICH agent, when it is one (MIN-282).
 *
 * The NAME does not move — "minddy" in both cases, it is the rule
 * identity. What we resolve here is the FACE: the canonical agent carried by
 * the key (“claude-code”, “cursor”…), which the line renders as a logo. A version
 * from before this column does not have one, and falls on Numo's face — the correct
 * fallback, an MCP key being the exception.
 */
async function resolveAgents(rows: VersionRow[]): Promise<Map<string, string | null>> {
  const actors = await resolveApiKeyActors(rows.map((row) => row.author_api_key_id));
  return new Map([...actors].map(([id, actor]) => [id, actor.agent]));
}

function toVersion(
  row: VersionRow,
  names: Map<string, string>,
  agents: Map<string, string | null>
): PageVersion {
  return {
    id: row.id,
    page_id: row.page_id,
    version: row.version,
    title: row.title,
    icon: row.icon,
    ...(row.content !== undefined ? { content: row.content } : {}),
    author_id: row.author_id,
    author_kind: row.author_kind,
    author_name:
      row.author_kind === "agent"
        ? SITE_NAME
        : (row.author_id ? names.get(row.author_id) : "") || "",
    author_agent: row.author_api_key_id
      ? (agents.get(row.author_api_key_id) ?? null)
      : null,
    created_at: row.created_at,
  };
}

/** The history of a page, from newest to oldest. */
export async function listPageVersions(
  pageId: string,
  actorId: string
): Promise<PageVersionResult<PageVersion[]>> {
  const service = getServiceClient();
  const page = await reachable(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };

  const { data, error } = await service
    .from("page_versions")
    .select(VERSION_COLUMNS)
    .eq("page_id", pageId)
    .order("version", { ascending: false })
    .limit(200);
  if (error) {
    console.error("[page-versions] list failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const rows = (data ?? []) as unknown as VersionRow[];
  const [names, agents] = await Promise.all([
    resolveAuthors(service, rows),
    resolveAgents(rows),
  ]);
  return { ok: true, data: rows.map((row) => toVersion(row, names, agents)) };
}

/** ONE version, including body — the read-only preview. */
export async function getPageVersion(
  pageId: string,
  versionId: string,
  actorId: string
): Promise<PageVersionResult<PageVersion>> {
  const service = getServiceClient();
  const page = await reachable(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };

  const { data, error } = await service
    .from("page_versions")
    .select(`${VERSION_COLUMNS}, content`)
    // The `page_id` is in the condition, not just in the URL: a
    // version of ANOTHER page (so perhaps from another project) cannot be read
    // going through a page to which we are entitled.
    .eq("page_id", pageId)
    .eq("id", versionId)
    .maybeSingle();
  if (error) {
    console.error("[page-versions] read failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) return { ok: false, status: 404, errorKey: "pageVersionNotFound" };

  const row = data as unknown as VersionRow;
  const [names, agents] = await Promise.all([
    resolveAuthors(service, [row]),
    resolveAgents([row]),
  ]);
  return { ok: true, data: toVersion(row, names, agents) };
}

/**
 * PUTS a version back in place.
 *
 * A new write, made by the person who clicks: it bears his name, it
 * increments the `version`, it replays the search projection — and it
 * archives the state before it, `alwaysArchive` short-circuiting the coalescence.
 * It is this last point which makes the gesture safe: restoring by mistake undoes
 * by restoring the line that the restoration itself has just created.
 *
 * The title and the icon return with the body. These are three fields of the same
 * state; rendering two out of three would result in a page that never existed.
 */
export async function restorePageVersion(
  pageId: string,
  versionId: string,
  actorId: string
): Promise<PageVersionResult<Page>> {
  const found = await getPageVersion(pageId, versionId, actorId);
  if (!found.ok) return found;

  const result = await updatePage({
    pageId,
    actorId,
    kind: "human",
    alwaysArchive: true,
    input: {
      content: found.data.content ?? { type: "doc", content: [] },
      title: found.data.title,
      icon: found.data.icon,
    },
  });
  if (!result.ok) {
    return { ok: false, status: result.status, errorKey: result.errorKey };
  }
  return { ok: true, data: result.page };
}
