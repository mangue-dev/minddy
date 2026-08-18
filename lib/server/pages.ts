import "server-only";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  descendantIds,
  isPosition,
  positionAtEnd,
  wouldCreateCycle,
  type Page,
  type PageWriteKind,
} from "@/lib/pages";
import { exceedsJsonDepth, MAX_PAGE_JSON_DEPTH } from "@/lib/json-depth";
import { checkPageContent } from "@/lib/page-content-schema";
import { afterOrNow } from "@/lib/server/after-safe";
import {
  notifyAgentPageWrite,
  recordPageEvent,
  type PageEventType,
} from "@/lib/server/page-activity";
import { notifyPageMentions } from "@/lib/server/page-mentions";
import { queuePageBodyLinks } from "@/lib/server/page-links";
import { appendSubpage, remapSubpages, removeSubpages } from "@/lib/pages-subpage";
import { bodyFromMarkdownServer } from "@/lib/server/pages-projection";
import {
  queueSearchText,
  runPageSearch,
  type PageSearchHit,
} from "@/lib/server/pages-search";
import type { PageDocJSON } from "@/lib/pages-merge";

/**
 * PAGES of a project (MIN-266) — the server core, shared by routes
 * (`app/api/projects/[id]/pages/**`) and, later, by the MCP.
 *
 * EVERYTHING goes through the client service, RLS bypassed: access control lives
 * so here in `access()`, and it is the same for all six gestures — read,
 * create, modify, move, trash, restore. Project member = all
 * rights, as for goals: a team wiki that would require one
 * permission per page is no longer a team wiki.
 *
 * Two reasons NOT to write to the session client, while the policy
 * `pages_update` would allow it:
 *
 * 1. the CYCLE guard (`wouldCreateCycle`) needs to read all the pages
 * of the project, including trashed pages, before writing — which the reading policy of
 * precisely hides ;
 * 2. the trash makes the line invisible to `pages_select`, so the RETURNING
 * of a `update` done to the session client would no longer make it and the route
 * would believe a 404 (same trap as `lib/server/trash.ts`).
 *
 * Since MIN-276, one more rule, and it is an INVARIANT of the module: **any
 * writing of `content` is followed by `queueSearchText`**, which replays the
 * markdown projection in column `search_text` — the one that la
 * is indexing. A write path that forgets it doesn't break anything visible: it
 * simply leaves the page unfindable by its content, silently. Hence the
 * STRUCTURAL test of `pages-search-paths.test.ts`, which rereads this file and
 * refuses a `insert`/`update` carrying `content` without its catch-up.
 *
 * Since MIN-277, the same rule applies a second time, and for the same reason:
 * **any writing in the body bears its author (`writtenBy`) and archives the state
 * that it covers (`stampPageWrite`)**. A path that forgets it doesn't break anything visible either — it just makes an anonymous and irreversible writing, this
 * that we only discover the day the agent overwrites a page. The structural test
 * of `pages-history-paths.test.ts` refuses it in the same way.
 *
 * Since MIN-278, a THIRD, of the same family: **all writing ANNOUNCES
 * what it does** (`announcePageWrite`) — her line of activity, the people
 * that she has just mentioned, and the launcher of the run when it is the agent who writes.
 * Forgetting it does not break anything visible once again: it simply returns a
 * page which changes without anything happening, which was the state before the
 * ticket. Same structural test, with a single named exception — the mirror
 * `syncParentBody`, which is never a gesture in itself.
 *
 * Since MIN-279, a FOURTH, and it's the same family once again:
 * **any writing of `content` replays the links of the page**
 * (`queuePageBodyLinks`), that is to say the trackbacks that its body MAKES
 * in the pages it cites. Forgetting it doesn't break anything visible here — it leaves
 * just ANOTHER page unaware that it's cited, which we never find out
 * from the one we're currently writing. `page-links-paths.test.ts` refuses it
 * with the same rule: `queueSearchText` and `queuePageBodyLinks` go together.
 */

export type PageResult<T> =
  | { ok: true; page: T }
  | {
      ok: false;
      status: number;
      errorKey: PageErrorKey;
      /**
 * The page AS IS in the base, attached to the version refusal (MIN-271).
 * Without it, the client would only have a 409 and would have to re-request the
 * document to merge — one more round trip at the worst moment, that
 * where two people are writing at the same time time.
 */
      conflict?: Page;
    };

export type PageErrorKey =
  | "projectNotFound"
  | "pageNotFound"
  | "pageVersionNotFound"
  | "pageParentNotFound"
  | "pageCycle"
  | "pageStale"
  | "pageNotEmpty"
  | "pageTooLarge"
  | "pageTooDeep"
  | "pageContentRefused"
  | "noFieldsToUpdate"
  | "databaseError";

/** The title of a page: same ceiling as a ticket title (MIN-118). */
const MAX_TITLE_LENGTH = 500;

/**
 * The body, in bytes of JSON. A 1 MB ProseMirror document is already a
 * page that no editor renders comfortably; beyond that we refuse rather than
 * to let a write cause the request to fall on a platform limit,
 * where the user would understand nothing of the message.
 */
const MAX_CONTENT_BYTES = 1_000_000;

/** An emoji, not a sentence: we limit ourselves rather than validating an alphabet. */
const MAX_ICON_LENGTH = 16;

/**
 * The columns of the LIST. The body is absent, deliberately: the sidebar
 * loads all the pages of the project at once (that's the whole point of the flat
 * model), and attaching each ProseMirror document to it would make this query the
 * heaviest on the screen for content that no one displays. The body reads
 * page by page, when opened.
 */
const LIST_COLUMNS =
  "id, project_id, parent_id, title, icon, version, position, favorite, created_by, updated_by, updated_kind, updated_api_key_id, created_at, updated_at, deleted_at, deleted_by, deleted_root_id, parent_block_removed";

const FULL_COLUMNS = `${LIST_COLUMNS}, content`;

/** A page without its body — what the list renders. */
export type PageSummary = Omit<Page, "content">;

type Service = ReturnType<typeof getServiceClient>;

/* ─── Access ───────────────────────────────── ───────────────────────────────── */

/** The project must be accessible to the actor, otherwise it does not exist for him. */
async function access(actorId: string, projectId: string): Promise<boolean> {
  return (await getProjectAccess(actorId, projectId)) !== null;
}

/**
 * A page and its project, or null. `includeTrashed` is only true for
 * gestures which refer to a trashed page (restore).
 */
async function loadPage(
  service: Service,
  pageId: string,
  { includeTrashed = false }: { includeTrashed?: boolean } = {}
): Promise<Page | null> {
  const query = service.from("pages").select(FULL_COLUMNS).eq("id", pageId);
  if (!includeTrashed) query.is("deleted_at", null);
  const { data } = await query.maybeSingle();
  return (data as Page | null) ?? null;
}

/**
 * All the pages of the project, including trashed, in one request.
 *
 * It is the reading which makes cycle guarding possible: reparenting requires
 * to know the chain of ancestors, and to reconstitute it by successive jumps
 * would be an N+1 whose depth is precisely unlimited.
 */
async function loadProjectPages(
  service: Service,
  projectId: string
): Promise<Page[]> {
  const { data } = await service
    .from("pages")
    .select("id, parent_id, position, deleted_at, deleted_root_id")
    .eq("project_id", projectId);
  return (data ?? []) as unknown as Page[];
}

/* ─── The author of a writing, and the state it covers (MIN-277) ────────── */

/**
 * The AUTHOR columns to be placed on any page entry.
 *
 * `kind` is not deduced from `actorId`: an entry from Numo, MCP or
 * the code agent carries the id of the account which has it permitted. It's the SURFACE that
 * knows what gesture it is, and it transports it here.
 */
function writtenBy(
  actorId: string,
  kind: PageWriteKind,
  mcpKeyId: string | null = null
): {
  updated_by: string;
  updated_kind: PageWriteKind;
  updated_api_key_id: string | null;
} {
  // The KEY, when the writing comes from the MCP (MIN-282): “agent” covers two
  // faces — Numo, and the agent who holds a key, who has a name and a logo. There
  // column is what allows the history to show the correct one, like
  // the activity already does this by `issue_events.api_key_id`.
  return {
    updated_by: actorId,
    updated_kind: kind,
    updated_api_key_id: kind === "agent" ? mcpKeyId : null,
  };
}

/**
 * The history COALESCENCE window.
 *
 * The editor saves one second after the last keystroke: a version by
 * writing would make forty lines for a paragraph written in one go, and a
 * history that we no longer read. The same person who writes without stopping only
 * therefore only produces one line per five minutes - the rule of Notion,
 * and the one which makes the history readable rather than exhaustive.
 *
 * What the window NEVER covers: a change of author. The state written
 * by a human is archived no matter what happens before the agent (or a
 * teammate) recovers it — this is exactly the state we will come for.
 */
const VERSION_COALESCE_MS = 5 * 60_000;

/**
 * Archives the state that a write has just OVERLAYED.
 *
 * Called after the write, never before: a rejected write (conflict of
 * version) has not covered anything, and its history line would be a duplicate of
 * state current.
 *
 * `previous` to `null` = a CREATION: there is nothing behind it. The call point
 * is kept anyway, and this is intended — the rule “all writing
 * of the body goes through here” is then read on all paths, without exception to
 * retained (see `pages-history-paths.test.ts`).
 *
 * Excluding critical path (`afterOrNow`): publisher save should not
 * wait for check-in, and a detached promise would die with response
 * (lib/server/after-safe.ts).
 */
function stampPageWrite({
  service,
  previous,
  actorId,
  kind,
  always = false,
}: {
  service: Service;
  /** The state BEFORE writing, as it was read. `null` on a creation. */
  previous: Page | null;
  /** The author of the covering writing — the one who closes the window. */
  actorId: string;
  kind: PageWriteKind;
  /** Archive without going through coalescence: restoring a version ne
 must never lose the state before it, even written ten seconds earlier. */
  always?: boolean;
}): void {
  if (!previous) return;

  // The author of the archived STATE, and not the author of the writing that erases it. On
  // a page never rewritten since its creation (or born before MIN-277), it is
  // its creator: the history line names someone rather than no one.
  const authorId = previous.updated_by ?? previous.created_by;
  const authorKind: PageWriteKind = previous.updated_kind ?? "human";
  // The key to the ARCHIVED state, like its author: that before writing which
  // covers it. Null as soon as the author is not a key agent.
  const authorKeyId = previous.updated_api_key_id ?? null;

  afterOrNow(async () => {
    if (!always && authorId === actorId && authorKind === kind) {
      const { data } = await service
        .from("page_versions")
        .select("id")
        .eq("page_id", previous.id)
        .gte("created_at", new Date(Date.now() - VERSION_COALESCE_MS).toISOString())
        .limit(1);
      if (data && data.length > 0) return;
    }

    const { error } = await service.from("page_versions").insert({
      page_id: previous.id,
      project_id: previous.project_id,
      version: previous.version,
      title: previous.title,
      icon: previous.icon,
      content: previous.content ?? { type: "doc", content: [] },
      author_id: authorId,
      author_kind: authorKind,
      author_api_key_id: authorKeyId,
    });
    if (error) console.error("[pages] version snapshot failed:", error.message);
  });
}

/**
 * What a page write DOES KNOW (MIN-278).
 *
 * The counterpart of `stampPageWrite`, and placed in the same place for the same reason:
 * a page could change without anything happening — neither notification, nor line
 * of activity, nowhere. Three signals, a single crossing point:
 *
 * 1. **the activity** — “created / modified / trashed / restored”,
 * with its author, coalesced by page + actor + 5 minutes;
 * 2. **the mentions** — those just cited, and them alone (the comparison
 * with the PREVIOUS document is what makes a burst of autosaves only notify
 * once, to the save where the name appears);
 * 3. **writing AGENT** — to the sole launcher of the run.
 *
 * Off critical path (`afterOrNow`), like archiving: saving
 * the publisher should not wait for any of the three, and a detached promise would die
 * with the response (lib/server/after-safe.ts).
 *
 * End-to-end best-effort: none of the three does not go back to the appellant. A
 * line of lost activity should not cause a successful write to fail.
 */
function announcePageWrite({
  service,
  page,
  previous,
  actorId,
  kind,
  mcpKeyId,
  event,
  scanMentions = true,
}: {
  service: Service;
  /** The page as it was just written. */
  page: Page;
  /** The BEFORE state, for the difference in mentions. `null` on a creation. */
  previous: Page | null;
  actorId: string;
  kind: PageWriteKind;
  /** The MCP key behind the writing, when it comes from there. This is what
 distinguishes the two agents that `kind: "agent"` covers: that of a key,
 which has a name (“Claude Code (mcp)”), and ours, which is called Numo. */
  mcpKeyId?: string | null;
  event: PageEventType;
  /** DUPLICATION cuts it: recopying a text is not quoting someone, and
 copying a page would recopy all the names it bears. */
  scanMentions?: boolean;
}): void {
  afterOrNow(async () => {
    await recordPageEvent(service, {
      pageId: page.id,
      actorId,
      kind,
      type: event,
      mcpKeyId,
    });

    // Mentions can only be read on a BODY. A rename does not quote
    // no one, and even less a trash can.
    if (scanMentions && page.content !== undefined && page.content !== null) {
      await notifyPageMentions(service, {
        projectId: page.project_id,
        pageId: page.id,
        actorId,
        doc: page.content,
        previousDoc: previous?.content ?? undefined,
        // Quoting someone from a text written by the agent remains a quote
        // of the AGENT: the line names him, and not the account under which he
        // wrote.
        viaAssistant: kind === "agent",
        mcpKeyId,
      });
    }

    // “only when the actor is the agent”: it’s the SURFACE that knows this
    // (the six tools in lib/server/page-tools.ts sign `kind: "agent"`), and
    // `actorId` is the account that enabled it — therefore the launcher of the run.
    if (kind === "agent") {
      await notifyAgentPageWrite(service, {
        projectId: page.project_id,
        pageId: page.id,
        actorId,
      });
    }
  });
}

/* ─── Lecture ──────────────────────────────────────────────────────────────── */

/** The LIVING pages of the project, flat. The tree is rebuilt at the caller's house. */
export async function listPages(
  projectId: string,
  actorId: string
): Promise<
  { ok: true; pages: PageSummary[] } | { ok: false; status: number; errorKey: PageErrorKey }
> {
  if (!(await access(actorId, projectId))) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const { data, error } = await getServiceClient()
    .from("pages")
    .select(LIST_COLUMNS)
    .eq("project_id", projectId)
    .is("deleted_at", null)
    .order("position", { ascending: true });

  if (error) {
    console.error("[pages] list failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true, pages: (data ?? []) as unknown as PageSummary[] };
}

/** A page with his body. */
export async function getPage(
  pageId: string,
  actorId: string
): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  return { ok: true, page };
}

/**
 * Search the pages of ONE project, title and content (MIN-276).
 *
 * Sorting and extracting come from Postgres (`search_pages`, see migration):
 * `ts_rank_cd` knows what a `ilike` will never know - that a word in title weighs
 * more than a word cited in passing, and where to cut the sentence which explains the
 * result.
 *
 * An empty query returns an empty list WITHOUT going to the base: this is the state of the
 * search bar when opening, and it's not worth a round trip.
 */
export async function searchProjectPages({
  projectId,
  actorId,
  query,
  limit = 20,
}: {
  projectId: string;
  actorId: string;
  query: string;
  limit?: number;
}): Promise<
  | { ok: true; hits: PageSearchHit[] }
  | { ok: false; status: number; errorKey: PageErrorKey }
> {
  if (!(await access(actorId, projectId))) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }
  if (!query.trim()) return { ok: true, hits: [] };

  const result = await runPageSearch(getServiceClient(), {
    query,
    projectId,
    limit,
  });
  if (!result.ok) return { ok: false, status: 500, errorKey: "databaseError" };
  return { ok: true, hits: result.hits };
}

/* ─── Creation ─────────────────────────────── ──────────────────────────────── */

export async function createPage({
  projectId,
  actorId,
  kind = "human",
  mcpKeyId,
  input,
}: {
  projectId: string;
  actorId: string;
  /** The nature of the gesture (MIN-277): “agent” on the six writing tools. */
  kind?: PageWriteKind;
  /** The MCP key behind the gesture (MIN-278): it NAMES the agent in the activity
 and in quotes. Absent on our own agents, who are Numo. */
  mcpKeyId?: string | null;
  input: Record<string, unknown>;
}): Promise<PageResult<Page>> {
  if (!(await access(actorId, projectId))) {
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  const service = getServiceClient();
  const parentId = typeof input.parent_id === "string" ? input.parent_id : null;

  const all = await loadProjectPages(service, projectId);
  if (parentId) {
    // The parent must exist, belong to the SAME project and be alive: create
    // under a trashed page would create an invisible page from its birth.
    const parent = all.find((p) => p.id === parentId && !p.deleted_at);
    if (!parent) return { ok: false, status: 404, errorKey: "pageParentNotFound" };
  }

  // The body can arrive in MARKDOWN rather than in JSON ProseMirror: this is by
  // where the project wizard places the brief pasted on the “Initial Brief” page
  // (MIN-170). The projection is the SAME as that of Numo tools
  // (lib/server/pages-projection.ts) — a page written by the wizard and one
  // page written by the agent therefore reads the same, blocks and ids included.
  //
  // Doing it HERE and not at the caller has two effects: the page schema
  // (tiptap, the block register) stays out of the browser bundle, and the
  // size ceiling weighs the JSON PRODUCT, the one that really starts at the base.
  //
  // `content` wins when both are there: this is the native format.
  const raw =
    input.content === undefined && typeof input.markdown === "string"
      ? await bodyFromMarkdownServer(input.markdown)
      : input.content;

  const content = readContent(raw);
  if (content === "too-deep") {
    return { ok: false, status: 400, errorKey: "pageTooDeep" };
  }
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }
  if (content === "refused") {
    return { ok: false, status: 400, errorKey: "pageContentRefused" };
  }

  const row: Record<string, unknown> = {
    project_id: projectId,
    parent_id: parentId,
    title: readTitle(input.title) ?? "",
    icon: readIcon(input.icon),
    position: positionAtEnd(
      all.filter((p) => !p.deleted_at && (p.parent_id ?? null) === parentId)
    ),
    created_by: actorId,
    ...writtenBy(actorId, kind),
  };
  if (content !== undefined) row.content = content;

  const { data, error } = await service
    .from("pages")
    .insert(row)
    .select(FULL_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[pages] create failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const page = data as unknown as Page;
  queueSearchText(service, [page.id]);
  queuePageBodyLinks(service, [page.id]);
  // A creation covers nothing: the call only establishes the rule (cf.
  // `stampPageWrite`), it does not write any history lines.
  stampPageWrite({ service, previous: null, actorId, kind });
  // It SAYS, on the other hand: the project wizard and the agents create
  // entire pages at once, including mentions (MIN-278).
  announcePageWrite({
    service,
    page,
    previous: null,
    actorId,
    kind,
    mcpKeyId,
    event: "page_created",
  });
  return { ok: true, page };
}

/* ─── Duplication ──────────────────────────────────────────────────────────── */

/**
 * Copies a page AND all its descendants (MIN-272).
 *
 * Two things distinguish it from one more `insert`, and both count:
 *
 * 1. **internal links are rewritten.** Copy the bodies as is
 * would result in a copy whose subpage blocks still point to the
 * ORIGINALS — two trees in the sidebar, a single set of links. Hence the
 * ids drawn BEFORE writing: you have to know the table
 * `ancien → nouveau` to rewrite the bodies, so we cannot let the
 * base produce them. A quote outside the copied branch remains intact.
 * 2. **only one write.** The table starts at once: a half-done copy
 * would leave orphan pages that would have to be found by hand.
 *
 * The copy takes the SAME title. A suffix “(copy)” would require a
 * translation, therefore making data depend on the language of who clicked —
 * and the page opens just after, where the title changes to a keystroke.
 *
 * The root remains with the same parent, at the end of the siblings; the descendants
 * keep their position, the internal order of the branch is therefore preserved.
 */
export async function duplicatePage(
  pageId: string,
  actorId: string,
  kind: PageWriteKind = "human"
): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const live = all.filter((p) => !p.deleted_at);
  // `descendantIds` renders the descendants in width, therefore the parents before
  // their children: the insertion order satisfies the foreign key of itself.
  const family = [pageId, ...descendantIds(live, pageId)];

  const { data: sources, error: readError } = await service
    .from("pages")
    .select(FULL_COLUMNS)
    .in("id", family);
  if (readError || !sources) {
    console.error("[pages] duplicate read failed:", readError?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const byId = new Map((sources as unknown as Page[]).map((row) => [row.id, row]));
  const idMap = new Map(family.map((id) => [id, crypto.randomUUID()]));
  const rootPosition = positionAtEnd(
    live.filter((p) => (p.parent_id ?? null) === (page.parent_id ?? null))
  );

  const rows = family.flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    const root = id === pageId;
    return [
      {
        id: idMap.get(id)!,
        project_id: source.project_id,
        // The ROOT stays where it is; descendants follow their parent
        // COPIED, never the original — otherwise the copy would hang on the tree
        // original and the two branches would mix.
        parent_id: root
          ? source.parent_id
          : (idMap.get(source.parent_id ?? "") ?? null),
        title: source.title,
        icon: source.icon,
        content: remapSubpages(source.content as PageDocJSON | null, idMap),
        position: root ? rootPosition : source.position,
        created_by: actorId,
        // The COPY is a new writing, from the one who requested it: it
        // bears his name, and not that of the last author of the original.
        ...writtenBy(actorId, kind),
      },
    ];
  });

  const { data, error } = await service
    .from("pages")
    .insert(rows)
    .select(FULL_COLUMNS);
  if (error || !data) {
    console.error("[pages] duplicate failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // The whole branch, not just the root: each copy carries its own
  // body (the internal links have even been rewritten), therefore its own text.
  queueSearchText(
    service,
    (data as unknown as Page[]).map((row) => row.id)
  );
  queuePageBodyLinks(
    service,
    (data as unknown as Page[]).map((row) => row.id)
  );
  // NEW pages: like creation, they cover nothing.
  stampPageWrite({ service, previous: null, actorId, kind });

  const rootId = idMap.get(pageId);
  const copy = (data as unknown as Page[]).find((row) => row.id === rootId);
  if (!copy) return { ok: false, status: 500, errorKey: "databaseError" };
  // The ROOT alone is announced: a branch of twenty pages copied with a gesture
  // is one gesture, not twenty.
  announcePageWrite({
    service,
    page: copy,
    previous: null,
    actorId,
    kind,
    event: "page_created",
    scanMentions: false,
  });
  return { ok: true, page: copy };
}

/* ─── Modification ─────────────────────────────────────────────────────────── */

/**
 * Edits a page. Absent fields do not move.
 *
 * `parent_id` is the only one that can be REFUSED: the depth being
 * is unlimited, putting a page under one of its own descendants would close a
 * loop and send the sidebar into infinite recursion. 409, and nothing is
 * written — not even the other fields of the same request, which would otherwise be
 * "half-applied" to a gesture that the user believes to be refused.
 *
 * A reparenting without explicit `position` places the page at the end of its NEW
 * siblings: keeping the old key would land it in an arbitrary place in the
 * middle of pages that have nothing to do with it.
 */
export async function updatePage({
  pageId,
  actorId,
  kind = "human",
  mcpKeyId,
  alwaysArchive = false,
  input,
}: {
  pageId: string;
  actorId: string;
  /** The nature of the gesture (MIN-277): “agent” on the six writing tools. */
  kind?: PageWriteKind;
  /** The MCP key behind the gesture (MIN-278): cf. `createPage`. */
  mcpKeyId?: string | null;
  /** Archives the covered state outside of coalescence — restoring a version
 (see `restorePageVersion`), the only action that requires it. */
  alwaysArchive?: boolean;
  input: Record<string, unknown>;
}): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const patch: Record<string, unknown> = {};

  const title = readTitle(input.title);
  if (title !== undefined) patch.title = title;

  if ("icon" in input) patch.icon = readIcon(input.icon);

  // The favorite is a NU boolean: shared by the project, it has neither order nor
  // owner to write next to it (see the `pages_favorite` migration).
  if (typeof input.favorite === "boolean") patch.favorite = input.favorite;

  const content = readContent(input.content);
  if (content === "too-deep") {
    return { ok: false, status: 400, errorKey: "pageTooDeep" };
  }
  if (content === "too-large") {
    return { ok: false, status: 413, errorKey: "pageTooLarge" };
  }
  if (content === "refused") {
    return { ok: false, status: 400, errorKey: "pageContentRefused" };
  }

  // The VERSION on which the writing is based (MIN-271). It doesn't make sense
  // only with a body: renaming a page is not an argument with anyone.
  const expected =
    content !== undefined && typeof input.version === "number"
      ? input.version
      : null;
  if (expected !== null && expected !== page.version) {
    return { ok: false, status: 409, errorKey: "pageStale", conflict: page };
  }

  if (content !== undefined) {
    patch.content = content;
    // `version` counts BODY writes, not renames: this is the
    // concurrent backup guardrail (MIN-271).
    patch.version = page.version + 1;
  }

  const moving = "parent_id" in input;
  if (moving) {
    const nextParentId =
      typeof input.parent_id === "string" ? input.parent_id : null;
    const all = await loadProjectPages(service, page.project_id);

    if (nextParentId) {
      const parent = all.find((p) => p.id === nextParentId && !p.deleted_at);
      if (!parent) {
        return { ok: false, status: 404, errorKey: "pageParentNotFound" };
      }
    }
    if (wouldCreateCycle(all, pageId, nextParentId)) {
      return { ok: false, status: 409, errorKey: "pageCycle" };
    }

    patch.parent_id = nextParentId;
    if (!isPosition(input.position)) {
      patch.position = positionAtEnd(
        all.filter(
          (p) =>
            !p.deleted_at &&
            p.id !== pageId &&
            (p.parent_id ?? null) === nextParentId
        )
      );
    }
  }

  // An explicit position comes from drag and drop: the client has calculated the
  // key between the two neighbors it sees (`positionBetween`). Outside the alphabet,
  // it would sort anywhere — we ignore it rather than write it down.
  if (isPosition(input.position)) patch.position = input.position;

  if (Object.keys(patch).length === 0) {
    return { ok: false, status: 400, errorKey: "noFieldsToUpdate" };
  }

  // The author is focused on what concerns the DOCUMENT - body, title, icon:
  // renaming a page means modifying it, and the header says "modified by",
  // not “body written by”.
  //
  // STORAGE does not sign. Pin a page (the favorite is shared
  // by the project, cf. migration `pages_favorite`) or drag it into
  // the tree says nothing about its contents, and signing these gestures would display
  // “edited by Bob” at the top of a page that Bob never opened —
  // exactly the false attribution that MIN-277 exists to avoid.
  //
  // HISTORY only deals with the body - it is the only state that we
  // puisse vouloir remonter.
  const writesDocument =
    patch.content !== undefined || patch.title !== undefined || "icon" in patch;
  if (writesDocument) Object.assign(patch, writtenBy(actorId, kind));

  // The lock is IN the write, not just in the control above:
  // two recordings started at the same millisecond both pass the
  // control (they read the same line) and the second would erase the first. There
  // condition `version = celle qu'on a lue` means that one of the two does not write
  // nothing, and melts again as if it had been refused from the start.
  const write = service.from("pages").update(patch).eq("id", pageId);
  if (expected !== null) write.eq("version", expected);

  const { data, error } = await write
    .is("deleted_at", null)
    .select(FULL_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error("[pages] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) {
    // No line: either the page has just gone to the trash, or the
    // version moved between reading and writing. We reread to decide —
    // the two answers do not match in the same way.
    if (expected !== null) {
      const fresh = await loadPage(service, pageId);
      if (fresh) {
        return { ok: false, status: 409, errorKey: "pageStale", conflict: fresh };
      }
    }
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  // The title enters the index through the generated column, without anything to write; THE
  // body needs its projection. The line therefore only leaves when the
  // body has moved — a rename has no text to replay.
  if (patch.content !== undefined) {
    queueSearchText(service, [pageId]);
    queuePageBodyLinks(service, [pageId]);
    // The BEFORE state, the one we have just covered: the line read at the top of
    // this function. A writing that carries its `version` (the editor, the tools
    // of agent) also guarantees that it was indeed the BASIC state at the moment of
    // writing — the `eq("version", expected)` condition filtered the rest.
    stampPageWrite({ service, previous: page, actorId, kind, always: alwaysArchive });
  }
  // The announcement follows the SAME boundary as the signature (`writesDocument`): the
  // storage — pin, drag into the tree — does not make a line
  // “modified by”. Otherwise reordering the sidebar would fulfill the activity of a
  // draft gestures that no one considers as modifications.
  if (writesDocument) {
    announcePageWrite({
      service,
      page: data as unknown as Page,
      previous: page,
      actorId,
      kind,
      mcpKeyId,
      event: "page_updated",
    });
  }
  return { ok: true, page: data as unknown as Page };
}

/* ─── The mirror: the subpage block in the body of the parent ────────────────── */

/**
 * The same information is carried in two places, and that's where all the
 * traps are (MIN-272): `parent_id` does the truth, the `subpage` block of the parent
 * body is just a VIEW of it. These two functions keep the view updated when the
 * truth moves.
 *
 * Why here, and not in the editor: trash a page from
 * the tree must remove its block from the parent's body **even if no one has the
 * parent open** — and this is the case current. A gesture made in the sidebar, or
 * by Numo via the MCP, must leave the database coherent without a browser y
 * having anything to do with it.
 *
 * What this does to a client who has this parent in front of them: his
 * next backup leaves on a `version` expired, therefore in 409, and the merge
 * of MIN-271 swallows the deletion WITHOUT NOISE — a block that it has not touched and
 * that the remote has removed leaves without banner (lib/pages-merge.ts, __keep the trash, and one more orphan block renders cleanly. Decline
 * deleting because the mirror didn't follow through would be the wrong swap.
 */
async function syncParentBody(
  service: Service,
  parentId: string,
  actorId: string,
  edit: (doc: PageDocJSON | null) => { doc: PageDocJSON; changed: boolean }
): Promise<void> {
  const parent = await loadPage(service, parentId);
  if (!parent) return;

  const { doc, changed } = edit((parent.content as PageDocJSON | null) ?? null);
  if (!changed) return;

  // `version` is incremented as for any body entry:
  // it is this counter which triggers the merge for those who edit at the same time.
  // The condition on the read version does the rest — if someone wrote between
  // reading and here, we don't overwrite it; his own recording next
  // will go through the merge again, and the orphan block will surrender in the meantime.
  const { error } = await service
    .from("pages")
    .update({
      content: doc,
      version: parent.version + 1,
      // The author of the mirror is that of the GESTE (basket, restoration), and the
      // gesture is human: the agent has no path to the trash.
      ...writtenBy(actorId, "human"),
    })
    .eq("id", parentId)
    .eq("version", parent.version)
    .is("deleted_at", null);
  if (error) console.error("[pages] subpage sync failed:", error.message);
  // The body of the PARENT has just changed (one subpage block less or less
  // more): it is a writing of `content` like any other, and its text
  // indexed must follow — even when no one has the parent open.
  else {
    queueSearchText(service, [parentId]);
    queuePageBodyLinks(service, [parentId]);
    // And its previous state is archived like any other: the body of
    // parent loses a block without anyone having opened it, this is precisely a
    // writing that we may want to reassemble.
    stampPageWrite({ service, previous: parent, actorId, kind: "human" });
    // No ANNOUNCEMENT here (MIN-278), and this is deliberate: this mirror is never
    // a gesture in itself — it always accompanies a basket or a
    // restoration, which has already laid its line. Putting down a second would read
    // “X modified Folder” for each deleted subpage. And he can't
    // make a mention appear: it only adds or removes a block
    // sous-page.
  }
}

/* ─── Corbeille ────────────────────────────────────────────────────────────── */

/**
 * Puts a page in the trash WITH all its descendants (MIN-266).
 *
 * Recursive because the gesture that calls it most often is not a
 * “delete” button: this deletes the subpage block in the body of the
 * parent (MIN-272). Leaving the descendants alive would cause twenty
 * orphan pages to appear at the root of the sidebar for a deleted line of text.
 *
 * `deleted_root_id` marks the descendants and NOT the root: the trash
 * therefore only displays one line for the entire tree, and the restoration finds
 * exactly what went together. A subpage ALREADY in the trash before
 * this gesture is not touched (`is deleted_at null`): it keeps its own
 * root, and restoring the parent does not bring it back — which no one asked for.
 */
export async function trashPage(
  pageId: string,
  actorId: string,
  /** The nature of the gesture (MIN-278): "agent" when it is Numo who takes the trash -
 the trash is open to him (`move_to_trash`, type `page`), and without that the
 line of activity would name the human with a gesture that he did not make. */
  kind: PageWriteKind = "human"
): Promise<{ ok: true; trashed: number } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const descendants = descendantIds(
    all.filter((p) => !p.deleted_at),
    pageId
  );
  const deletedAt = new Date().toISOString();

  const { error: rootError } = await service
    .from("pages")
    .update({ deleted_at: deletedAt, deleted_by: actorId, deleted_root_id: null })
    .eq("id", pageId)
    .is("deleted_at", null);
  if (rootError) {
    console.error("[pages] trash failed:", rootError.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  if (descendants.length > 0) {
    const { error } = await service
      .from("pages")
      .update({
        deleted_at: deletedAt,
        deleted_by: actorId,
        deleted_root_id: pageId,
      })
      .in("id", descendants)
      .is("deleted_at", null);
    if (error) {
      console.error("[pages] trash descendants failed:", error.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  }

  // The opposite direction (MIN-272): the block of the parent's body leaves with the
  // page. Only the ROOT of the gesture is affected — the descendant blocks
  // live in bodies that go to the trash at the same time.
  //
  // And we REMEMBER that we removed it: the restoration must not put back a block
  // only where there was one (see migration, column
  // `parent_block_removed`). A page born in the sidebar has never had
  // block, taking it out of the trash does not have to invent one for it.
  if (page.parent_id) {
    let cleared = false;
    await syncParentBody(service, page.parent_id, actorId, (doc) => {
      const { doc: next, removed } = removeSubpages(doc, [pageId]);
      cleared = removed > 0;
      return {
        doc: (next ?? { type: "doc", content: [] }) as PageDocJSON,
        changed: cleared,
      };
    });
    if (cleared) {
      await service
        .from("pages")
        .update({ parent_block_removed: true })
        .eq("id", pageId);
    }
  }

  // The ROOT of the gesture alone (MIN-278): the descendants leave with it, and a
  // line per page would make twenty lines for one erased block. The trash remains
  // the only destructive gesture on the pages — it's the line we're looking for.
  announcePageWrite({
    service,
    page,
    previous: null,
    actorId,
    kind,
    event: "page_trashed",
    scanMentions: false,
  });
  return { ok: true, trashed: descendants.length + 1 };
}

/**
 * A body that can be considered NEVER WRITTEN: empty, or reduced to
 * empty paragraph rendered by a page that has just been created.
 */
function isBlankDoc(content: unknown): boolean {
  const blocks = (content as { content?: unknown[] } | null)?.content;
  if (!Array.isArray(blocks) || blocks.length === 0) return true;
  if (blocks.length > 1) return false;
  const only = blocks[0] as { type?: string; content?: unknown[] };
  return only?.type === "paragraph" && !only.content?.length;
}

/**
 * DESTROYS a page that remains empty - the only gesture of the module which does not pass through
 * the trash (MIN-270).
 *
 * It only serves one thing: create a page then leave without writing a
 * letter there must leave nothing behind. Going through the trash would fill
 * it with untitled pages that no one wanted, which is exactly
 * the noise we are trying to avoid.
 *
 * What makes destruction acceptable is CUSTODY, and it is checked
 * HERE instead only to the client: without title, without icon, without body, without
 * subpage. A page that fails this test responds 409 and is not touched —
 * so the client has no way of making content disappear via this
 * path, even by lying about what it believes to be empty.
 */
export async function discardPage(
  pageId: string,
  actorId: string
): Promise<{ ok: true } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  if (page.title.trim() !== "" || page.icon || !isBlankDoc(page.content)) {
    return { ok: false, status: 409, errorKey: "pageNotEmpty" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const hasChildren = all.some(
    (p) => p.parent_id === pageId && !p.deleted_at
  );
  if (hasChildren) return { ok: false, status: 409, errorKey: "pageNotEmpty" };

  // The block of the parent's body leaves BEFORE the line: it is the same direction as the
  // trash (MIN-272), and the order counts — a destroyed line whose block
  // survive leaves a dead link in the parent document.
  if (page.parent_id) {
    await syncParentBody(service, page.parent_id, actorId, (doc) => {
      const { doc: next, removed } = removeSubpages(doc, [pageId]);
      return {
        doc: (next ?? { type: "doc", content: [] }) as PageDocJSON,
        changed: removed > 0,
      };
    });
  }

  const { error } = await service.from("pages").delete().eq("id", pageId);
  if (error) {
    console.error("[pages] discard failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  return { ok: true };
}

/**
 * Restores a page and everything that went with it.
 *
 * The case that matters: the restored page had a parent, itself still in the
 * trash (it was deleted separately, or the user restores from the
 * trash a page whose the tree moved). Making the child without the parent the
 * would leave VISIBLE nowhere — the sidebar doesn't show it, and its page is
 * a dead link. It therefore goes back to the root, at the end of the siblings: misplaced
 * rather than not found.
 */
export async function restorePage(
  pageId: string,
  actorId: string,
  /** Like the recycle bin above: restore is the reverse gesture, and it opens to the same caller. */
  kind: PageWriteKind = "human"
): Promise<{ ok: true; restored: number } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId, { includeTrashed: true });
  if (!page || !page.deleted_at) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  if (!(await access(actorId, page.project_id))) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  const all = await loadProjectPages(service, page.project_id);
  const family = [pageId, ...all.filter((p) => p.deleted_root_id === pageId).map((p) => p.id)];

  const { error } = await service
    .from("pages")
    .update({ deleted_at: null, deleted_by: null, deleted_root_id: null })
    .in("id", family);
  if (error) {
    console.error("[pages] restore failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // Is the parent still absent? (Trashed for his part, or purged.)
  const parent = page.parent_id
    ? all.find((p) => p.id === page.parent_id && !p.deleted_at)
    : null;
  if (page.parent_id && !parent) {
    const { error: liftError } = await service
      .from("pages")
      .update({
        parent_id: null,
        position: positionAtEnd(
          all.filter((p) => !p.deleted_at && p.parent_id === null)
        ),
      })
      .eq("id", pageId);
    if (liftError) {
      console.error("[pages] restore lift failed:", liftError.message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
  } else if (parent && page.parent_block_removed) {
    // The block returns to the parent body, at the END of the document (MIN-272).
    // Nothing is duplicated: `appendSubpage` does not set anything if the body
    // already cites the page — the case of a block recreated by hand in the meantime.
    await syncParentBody(service, parent.id, actorId, (doc) => {
      const { doc: next, added } = appendSubpage(doc, pageId);
      return { doc: next, changed: added };
    });
  }

  // The brand does not survive the restoration: the page is alive again,
  // and it's the next move to the trash that will say what it is then.
  if (page.parent_block_removed) {
    await service
      .from("pages")
      .update({ parent_block_removed: false })
      .eq("id", pageId);
  }

  // The counterpart of the trash can: without this line, a page reappears in the
  // sidebar would have done it without anything saying so.
  announcePageWrite({
    service,
    page,
    previous: null,
    actorId,
    kind,
    event: "page_restored",
    scanMentions: false,
  });
  return { ok: true, restored: family.length };
}

/* ─── Reading input ────────────────────────── ────────────────────────── */

function readTitle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.slice(0, MAX_TITLE_LENGTH);
}

function readIcon(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const icon = value.trim();
  return icon ? icon.slice(0, MAX_ICON_LENGTH) : null;
}

/**
 * The ProseMirror body. `undefined` = field is not in the request,
 * `"too-large"` = refused. A value which is not an object is ignored rather than refused: it is the same treatment as an unknown status elsewhere, and the only possible harm is not to write what one has not been able to read.
 *
 * Three guards, in THIS order, and the order is the subject :
 *
 * 1. DEPTH first (MIN-348) — weighing a document is serializing it,
 * and `JSON.stringify` goes down the tree through the call stack: on a body
 * nested ten thousand times, this is the guardrail falling, not what he was supposed to
 * stop. Recursive descent of the schema would fall similarly;
 * 2. the SIZE, before traversing the tree node by node;
 * 3. the SCHEMA (MIN-350): known types, known attributes, addresses without
 * hostile protocol (lib/page-content-schema.ts). It makes the body CLEAN
 * of its unknown attributes — it is this value which is taken as base.
 */
function readContent(
  value: unknown
): unknown | undefined | "too-large" | "too-deep" | "refused" {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  if (exceedsJsonDepth(value, MAX_PAGE_JSON_DEPTH)) return "too-deep";
  if (JSON.stringify(value).length > MAX_CONTENT_BYTES) return "too-large";
  const checked = checkPageContent(value);
  if (!checked.ok) return "refused";
  return checked.content;
}
