import { scheduleRoutineEvents } from "@/lib/server/routine-hooks";
import "server-only";

import { storePageVersion, hasRecentPageVersion } from "./page-version-store";
import { isDatabaseSchema } from "@/lib/page-databases";

import { getServiceClient } from "@/lib/supabase-service";
import { getProjectAccess } from "@/lib/server/project-access";
import { readCompleteScopedRows } from "./complete-scoped-rows";
import { withSupabaseAbortSignal } from "./supabase-fetch";
import {
  byPosition,
  descendantIds,
  isPosition,
  positionAtEnd,
  wouldCreateCycle,
  type Page,
  type PageWriteKind,
} from "@/lib/pages";
import { readPageContent } from "./page-content-input";
import { afterOrNow } from "@/lib/server/after-safe";
import {
  notifyAgentPageWrite,
  recordPageEvent,
  type PageEventType,
} from "@/lib/server/page-activity";
import { notifyPageMentions } from "@/lib/server/page-mentions";
import { copyPageDatabaseViews } from "./page-database-views";
import { queuePageBodyLinks } from "@/lib/server/page-links";
import { appendSubpage, remapSubpages, removeSubpages } from "@/lib/pages-subpage";
import { bodyFromMarkdownServer, pageBodyToMarkdownServer, pageCollaborationServer } from "@/lib/server/pages-projection";
import {
  queueSearchText,
  runPageSearch,
  type PageSearchHit,
} from "@/lib/server/pages-search";
import {
  COLLAB_COLUMNS,
  CollabCommitError,
  appendCollaboration,
  commitCollaboration,
  decodeCollaborationJournal,
  fetchCollaborationJournal,
  findCollaborationReceipt,
  hasPendingSteps,
  listPendingCollaborations,
  materializeCollaboration,
  readCollaborationJournal,
  resetCollaboration,
  sealCollabBatches,
  serverCollabClientId,
  takeStreamRevisions,
  type CollabBatchInput,
  type JournalBatch,
  type StreamRevisions,
} from "@/lib/server/page-collaboration";
import {
  decideCollaborationGrant,
  grantNeedsRenewal,
  mintCollaborationToken,
  verifyCollaborationToken,
  type CollabGrant,
} from "@/lib/server/page-collaboration-token";
import {
  cachedStreamValue,
  forgetStreamValues,
  rememberStreamValue,
} from "@/lib/server/page-collaboration-cache";
import {
  COLLAB_FIELDS,
  PAGE_COLLABORATION_PROTOCOL,
  assembleCollabSteps,
  type CollabCatchUp,
  type CollabField,
  type CollabRefusal,
  type CollabSubmission,
  type CollabSubmitResult,
  type PageCollaborationSnapshot,
} from "@/lib/page-collaboration";
import type { PageDocJSON } from "@/lib/pages-merge";
import type { JSONContent } from "@tiptap/core";
import { decodePage, decodePageProjection, encodePage, pageContentValues } from "./page-content";
import { isContentEncryptionEnabled } from "./encryption/content-config";
import { hasDataRootKey } from "./encryption/local-key-wrapper";

/**
 * PAGES of a project (MIN-266) — the server core, shared by routes
 * (`app/api/projects/[id]/pages/**`) and, later, by the MCP.
 *
 * EVERYTHING goes through the client service, RLS bypassed: access control lives
 * so here in `access()` (read) and `pageWriteRefusal()` (create, modify,
 * move, trash, restore). Owner or member = all rights, as for goals: a team
 * wiki that would require one permission per page is no longer a team wiki.
 * A reader reads every page and writes none (MIN-693).
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
  | "databaseError"
  | "pageDatabaseInvalid"
  | "pageDatabaseStale"
  | "pageDatabaseRestoreParent"
  | "pageDatabaseMove"
  | "readOnlyProject";

/** The title of a page: same ceiling as a ticket title (MIN-118). */
const MAX_TITLE_LENGTH = 500;

/** An emoji, not a sentence: we limit ourselves rather than validating an alphabet. */
const MAX_ICON_LENGTH = 16;

/** UUIDs supplied by the optimistic web client; invalid values are ignored. */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The columns of the LIST. The body is absent, deliberately: the sidebar
 * loads all the pages of the project at once (that's the whole point of the flat
 * model), and attaching each ProseMirror document to it would make this query the
 * heaviest on the screen for content that no one displays. The body reads
 * page by page, when opened.
 */
const LIST_COLUMNS =
  "id, project_id, parent_id, title, icon, version, position, favorite, created_by, updated_by, updated_kind, updated_api_key_id, created_at, updated_at, deleted_at, deleted_by, deleted_root_id, parent_block_removed, database_schema, database_revision, database_title_name, property_values, encrypted_content, encryption_version, content_revision, page_is_database, page_has_values, page_is_blank";

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
 * Writing gestures (create, edit including favorite, move, trash, discard,
 * restore, duplicate) also need write access (MIN-693): a reader sees the
 * page, so the refusal is an explicit 403 rather than a 404. Presence pings
 * stay allowed to readers through `access()`.
 */
export async function pageWriteRefusal(
  actorId: string,
  projectId: string,
  notFound: "projectNotFound" | "pageNotFound"
): Promise<{ ok: false; status: number; errorKey: PageErrorKey } | null> {
  const projectAccess = await getProjectAccess(actorId, projectId);
  if (!projectAccess) return { ok: false, status: 404, errorKey: notFound };
  if (!projectAccess.canWrite) {
    return { ok: false, status: 403, errorKey: "readOnlyProject" };
  }
  return null;
}

/* ─── Watching (MIN-278 follow-up) ─────────────────────────────────────────── */

/**
 * Proves that the caller still has this page open on screen.
 *
 * One row per (page, viewer), upserted every `PAGE_WATCH_PING_MS` by
 * lib/page-watch.ts while the editor holds the document. It is what lets
 * `notifyAgentPageWrite` tell "away" from "reading": a fresh row is a reader,
 * and a reader needs no inbox line for an agent's write — it arrives live.
 * The route checks access itself; the table only ever carries rows for pages
 * the pinger can read.
 */
export async function touchPageWatcher(
  pageId: string,
  actorId: string
): Promise<boolean> {
  const service = getServiceClient();
  // The project id alone: a ping runs every twenty seconds and must not drag
  // the body through PostgREST each time.
  const { data } = await service
    .from("pages")
    .select("project_id")
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data?.project_id || !(await access(actorId, data.project_id))) {
    return false;
  }
  const { error } = await service
    .from("page_viewers")
    .upsert({ page_id: pageId, user_id: actorId }, { onConflict: "page_id,user_id" });
  if (error) {
    console.error("[pages] watch ping failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Leaves the page: removes the watcher row. Best-effort both ways — an error
 * costs nothing (the row goes stale on its own after `PAGE_WATCH_FRESH_MS`),
 * and so does a missing row.
 */
export async function clearPageWatcher(
  pageId: string,
  actorId: string
): Promise<void> {
  await getServiceClient()
    .from("page_viewers")
    .delete()
    .eq("page_id", pageId)
    .eq("user_id", actorId);
}

/**
 * A page and its project, or null. `includeTrashed` is only true for
 * gestures which refer to a trashed page (restore).
 *
 * This is the LIVE page (MIN-688): the stored projection plus the steps
 * accepted since it was materialized, so every reader sees the latest text.
 * A writer that re-seals the row's envelope must start from `loadStoredPage`
 * instead: writing the live text under the stored revision would replay
 * pending steps twice at the next materialization.
 */
async function loadPage(
  service: Service,
  pageId: string,
  actorId: string,
  { includeTrashed = false, projectAccess }: {
    includeTrashed?: boolean;
    /** A check already started for the project the caller expects. */
    projectAccess?: { projectId: string; allowed: Promise<boolean> };
  } = {}
): Promise<Page | null> {
  const row = await readAccessiblePageRow(service, pageId, actorId, { includeTrashed, projectAccess });
  if (!row) return null;
  return livePageView(service, row, actorId);
}

/** The page as STORED: the materialized projection, for envelope writers. */
async function loadStoredPage(
  service: Service,
  pageId: string,
  actorId: string
): Promise<Page | null> {
  const row = await readAccessiblePageRow(service, pageId, actorId, {});
  if (!row) return null;
  takeStreamRevisions(row);
  return decodePage(row, actorId);
}

async function readAccessiblePageRow(
  service: Service,
  pageId: string,
  actorId: string,
  { includeTrashed = false, projectAccess }: {
    includeTrashed?: boolean;
    projectAccess?: { projectId: string; allowed: Promise<boolean> };
  }
): Promise<Record<string, unknown> | null> {
  const query = service.from("pages").select(`${FULL_COLUMNS}, ${COLLAB_COLUMNS}`).eq("id", pageId);
  if (!includeTrashed) query.is("deleted_at", null);
  const { data } = await query.maybeSingle();
  if (!data?.project_id) return null;
  // The early check stands only for that project; any other page checks its own.
  const allowed = projectAccess && data.project_id === projectAccess.projectId
    ? await projectAccess.allowed : await access(actorId, data.project_id as string);
  return allowed ? data as Record<string, unknown> : null;
}

/**
 * The live view of a fetched row, without its revision columns. A pending
 * journal that cannot be read back (it should never happen) falls back to
 * the stored projection and asks for a materialization, which repairs it.
 */
async function livePageView(
  service: Service,
  row: Record<string, unknown>,
  actorId: string
): Promise<Page> {
  let page: Page;
  try {
    page = (await liveFromRow(service, row, actorId)).page;
  } catch (error) {
    if (!(error instanceof PendingJournalError)) throw error;
    console.error("[pages] pending journal unreadable; serving the stored page");
    scheduleMaterialization(service, row.id as string, { urgent: true });
    page = await decodePage(row, actorId);
  }
  const view = page as Page & { body_revision?: number; title_revision?: number };
  delete view.body_revision;
  delete view.title_revision;
  return view;
}

/** The stored page for a writer that re-seals its envelope (database cells). */
export async function getStoredPage(
  pageId: string,
  actorId: string
): Promise<PageResult<Page>> {
  const page = await loadStoredPage(getServiceClient(), pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  return { ok: true, page };
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
      if (await hasRecentPageVersion(service, previous.id,
        new Date(Date.now() - VERSION_COALESCE_MS).toISOString())) return;
    }

    try {
      await storePageVersion(service, {
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
    } catch {
      console.error("[pages] version snapshot failed");
    }
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
  activity = true,
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
  /** False for a live typing batch that continues the same author's write
   (MIN-688): its activity line and agent notice already exist, but a name
   typed in this batch must still be announced, so mentions stay on. */
  activity?: boolean;
}): void {
  afterOrNow(async () => {
    if (activity) {
      await recordPageEvent(service, {
        pageId: page.id,
        actorId,
        kind,
        type: event,
        mcpKeyId,
      });
    }

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
    if (activity && kind === "agent") {
      await notifyAgentPageWrite(service, {
        projectId: page.project_id,
        pageId: page.id,
        actorId,
      });
    }
  });
}

/* ─── Reading ──────────────────────────────────────────────────────────────── */

/** The LIVING pages of the project, flat. The tree is rebuilt at the caller's house. */
export async function listPages(
  projectId: string,
  actorId: string
): Promise<
  { ok: true; pages: PageSummary[] } | { ok: false; status: number; errorKey: PageErrorKey }
> {
  const readBatch = (after: string | null) => {
    let query = getServiceClient().from("pages").select(`${LIST_COLUMNS}, ${COLLAB_COLUMNS}`, { count: "exact" })
      .eq("project_id", projectId).is("deleted_at", null).order("id").limit(1000);
    if (after) query = query.gt("id", after);
    return query;
  };
  // Only the first batch overlaps the access check. Later batches, decoding
  // and the response wait for it, and a denial aborts that batch.
  const abort = new AbortController();
  // `then` sends the request now, inside the signal's scope.
  const firstBatch = withSupabaseAbortSignal(abort.signal, () => Promise.resolve(readBatch(null).then((batch) => batch)));
  void firstBatch.catch(() => {});
  let allowed: boolean;
  try {
    allowed = await access(actorId, projectId);
  } catch (error) {
    abort.abort();
    throw error;
  }
  if (!allowed) {
    abort.abort();
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }

  try {
    const rows = await readCompleteScopedRows<Record<string, unknown>>(
      (after) => after === null ? firstBatch : readBatch(after), (row) => row.id);
    const service = getServiceClient();
    const pages = await Promise.all(rows.map(async (row) => {
      const revisions = takeStreamRevisions(row);
      const { content: _body, body_revision: _b, title_revision: _t, ...summary } =
        await decodePageProjection(row, actorId);
      // A title being typed shows its pending steps too (MIN-688); the body
      // is not part of the list.
      if (revisions.head.title > revisions.materialized.title) {
        summary.title = await liveTitle(service, summary as unknown as Page, revisions, actorId);
      }
      return summary as unknown as PageSummary;
    }));
    return { ok: true, pages: pages.sort(byPosition) };
  } catch {
    console.error("[pages] complete_list_failed");
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
}

/**
 * A page with its body. `projectId`, the project a route names, starts its
 * access check alongside the page read; loadPage still decodes nothing until
 * access to the page's own project is confirmed.
 */
export async function getPage(
  pageId: string,
  actorId: string,
  { projectId }: { projectId?: string } = {}
): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const allowed = projectId ? access(actorId, projectId) : undefined;
  // Awaited only when the page belongs to that project.
  void allowed?.catch(() => {});
  const page = await loadPage(service, pageId, actorId,
    { projectAccess: projectId && allowed ? { projectId, allowed } : undefined });
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
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
  const refusal = await pageWriteRefusal(actorId, projectId, "projectNotFound");
  if (refusal) return refusal;

  const service = getServiceClient();
  const parentId = typeof input.parent_id === "string" ? input.parent_id : null;

  if (input.database_schema !== undefined && !isDatabaseSchema(input.database_schema)) {
    return { ok: false, status: 400, errorKey: "pageDatabaseInvalid" };
  }
  if (input.database_schema !== undefined && parentId) {
    const parent = await loadPage(service, parentId, actorId);
    if (parent?.database_schema) return { ok: false, status: 400, errorKey: "pageDatabaseInvalid" };
  }

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

  const content = readPageContent(raw);
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
    id: typeof input.id === "string" && UUID_RE.test(input.id)
      ? input.id : crypto.randomUUID(),
    project_id: projectId,
    parent_id: parentId,
    title: readTitle(input.title) ?? "",
    database_schema: input.database_schema ?? null,
    database_title_name: null,
    property_values: {},
    icon: readIcon(input.icon),
    // Born canonical (MIN-688): one schema-valid block with its ID, so every
    // collaborator opening the new page starts from the same document instead
    // of each editor filling the empty body with its own random block.
    content: pageCollaborationServer().canonicalBodyJSON(content ?? { type: "doc", content: [] }),
    position: isPosition(input.position) ? input.position : positionAtEnd(
      all.filter((p) => !p.deleted_at && (p.parent_id ?? null) === parentId)
    ),
    created_by: actorId,
    ...writtenBy(actorId, kind, mcpKeyId),
  };
  const stored = await encodePage(row, { service });

  const { data, error } = await service
    .from("pages")
    .insert(stored)
    .select(FULL_COLUMNS)
    .single();

  if (error || !data) {
    console.error("[pages] create failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const page = await decodePage(data, actorId);
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
  scheduleRoutineEvents();
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
  kind: PageWriteKind = "human",
  clientIds?: Record<string, string>
): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const refusal = await pageWriteRefusal(actorId, page.project_id, "pageNotFound");
  if (refusal) return refusal;

  const all = await loadProjectPages(service, page.project_id);
  const live = all.filter((p) => !p.deleted_at);
  // `descendantIds` renders the descendants in width, therefore the parents before
  // their children: the insertion order satisfies the foreign key of itself.
  const family = [pageId, ...descendantIds(live, pageId)];
  // The copy starts from the latest text (MIN-688): typing still pending in
  // the journal is materialized first.
  await materializePendingPages(service, family);

  const { data: sources, error: readError } = await service
    .from("pages")
    .select(FULL_COLUMNS)
    .in("id", family);
  if (readError || !sources) {
    console.error("[pages] duplicate read failed:", readError?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const decodedSources = await Promise.all(sources.map((row) => decodePage(row, actorId)));
  const byId = new Map(decodedSources.map((row) => [row.id, row]));
  const requestedIds = clientIds ? Object.values(clientIds) : [];
  if (requestedIds.some((id) => typeof id !== "string" || !UUID_RE.test(id)) ||
      new Set(requestedIds).size !== requestedIds.length) {
    return { ok: false, status: 400, errorKey: "pageContentRefused" };
  }
  const idMap = new Map(family.map((id) => [id, clientIds?.[id] ?? crypto.randomUUID()]));
  const rootPosition = positionAtEnd(
    live.filter((p) => (p.parent_id ?? null) === (page.parent_id ?? null))
  );

  const sourceParent = page.parent_id ? await loadPage(service, page.parent_id, actorId) : null;
  const rows = family.flatMap((id) => {
    const source = byId.get(id);
    if (!source) return [];
    const root = id === pageId;
    const parentSchema = (root ? sourceParent : byId.get(source.parent_id ?? ""))?.database_schema;
    // Removed properties are not part of the copied database's visible schema.
    const copiedValues = Object.fromEntries((parentSchema ?? []).flatMap((property) =>
      source.property_values && property.id in source.property_values
        ? [[property.id, source.property_values[property.id]]] : []));
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
        database_schema: source.database_schema ?? null,
        database_title_name: source.database_title_name ?? null,
        property_values: copiedValues,
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

  const protectedRows = await Promise.all(rows.map((row) => encodePage(row, { service })));
  const { data, error } = await service
    .from("pages")
    .insert(protectedRows)
    .select(FULL_COLUMNS);
  if (error || !data) {
    console.error("[pages] duplicate failed:", error?.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  // The whole branch, not just the root: each copy carries its own
  // body (the internal links have even been rewritten), therefore its own text.
  const copied = await Promise.all(data.map((row) => decodePage(row, actorId)));
  queueSearchText(
    service,
    copied.map((row) => row.id)
  );
  queuePageBodyLinks(
    service,
    copied.map((row) => row.id)
  );
  // NEW pages: like creation, they cover nothing.
  stampPageWrite({ service, previous: null, actorId, kind });
  // A copied database keeps its saved view (MIN-764); the copy stands without it.
  await copyPageDatabaseViews(service, page.project_id, idMap, actorId).catch((cause) => {
    console.error("[pages] duplicate view copy failed:", cause instanceof Error ? cause.message : cause);
  });

  const rootId = idMap.get(pageId);
  const copy = copied.find((row) => row.id === rootId);
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
  scheduleRoutineEvents();
  return { ok: true, page: copy };
}

/* ─── Live collaboration: the operation authority (MIN-688) ───────────────── */

/**
 * Every body or title write goes through the authority, whoever makes it: a
 * browser session sending ProseMirror steps, or a writer that only knows
 * whole documents (the PATCH of an older tab, Numo and the MCP, a restored
 * version, the subpage mirror). A whole document is first expressed as the
 * smallest replacement steps against the current one (`diffCollabSteps`), so
 * a collaborator typing elsewhere keeps their pending text and their caret,
 * and every connected editor receives the change live, in order.
 *
 * A session's typing batch is APPENDED (`submitPageCollaboration`): its steps
 * are journaled and its stream head advances, and the page row is left alone.
 * The row is rewritten once per burst of typing by a MATERIALIZATION
 * (`materializePage`): after two quiet seconds, sooner when many steps or old
 * ones are pending, and from a cron safety net. Whole-document writers and
 * agents COMMIT (`commitPageStreams`): steps and the projection at the new
 * heads in one transaction. Readers see the stored projection plus the
 * pending steps (`liveFromRow`).
 *
 * The four write rules of this module still hold on these paths — search text
 * and links follow the body, the history archives what a write covers, and
 * the write announces itself: `afterStreamCommit` for commits,
 * `materializationEffects` for appended typing.
 */

type CollabPage = Page & {
  /** Stream HEADS: the revisions of the live document. */
  body_revision: number;
  title_revision: number;
  content_revision: number;
};

/** A page as the authority sees it. */
interface LivePage {
  /** The live document: the stored projection plus the pending steps. */
  page: CollabPage;
  /** The decoded row, whose revisions are the materialized ones. */
  stored: CollabPage;
  revisions: StreamRevisions;
  /** Journal batches accepted after the materialized revision, in order. */
  pending: Record<CollabField, JournalBatch[]>;
  /** Whether the row is sealed (its journal batches must be too). */
  protect: boolean;
}

/**
 * The pending steps cannot be read back: `gap` when journal rows between the
 * materialized revision and the head are missing (a concurrent
 * materialization may just have pruned them), `unreadable` when they do not
 * apply (steps from a newer deployment, for example).
 */
class PendingJournalError extends Error {
  constructor(readonly kind: "gap" | "unreadable") {
    super("Pending page collaboration steps are not readable");
    this.name = "PendingJournalError";
  }
}

const COLLAB_PAGE_COLUMNS = `${FULL_COLUMNS}, ${COLLAB_COLUMNS}`;

/** The stored row of a page with its stream revisions, still sealed. Access is the caller's. */
async function fetchCollabRow(
  service: Service,
  pageId: string,
  projectId: string | null,
  { includeTrashed = false }: { includeTrashed?: boolean } = {}
): Promise<Record<string, unknown> | null> {
  let query = service.from("pages").select(COLLAB_PAGE_COLUMNS).eq("id", pageId);
  if (projectId !== null) query = query.eq("project_id", projectId);
  if (!includeTrashed) query = query.is("deleted_at", null);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(`page read failed: ${error.message}`);
  return (data as Record<string, unknown> | null) ?? null;
}

/** The journal batches from `from` to `to` of one stream, decrypted. */
async function pendingBatches(
  service: Service,
  page: { id: string; project_id: string },
  field: CollabField,
  from: number,
  to: number,
  actorId: string | null
): Promise<JournalBatch[]> {
  const batches: JournalBatch[] = [];
  let at = from;
  while (at < to) {
    const rows = await readCollaborationJournal(service, {
      pageId: page.id, projectId: page.project_id, field, since: at, actorId,
    });
    const before = at;
    for (const row of rows) {
      if (at >= to) break;
      if (row.base < at) continue;
      if (row.base !== at || row.steps.length !== row.stepCount) throw new PendingJournalError("gap");
      batches.push(row);
      at += row.stepCount;
    }
    if (at === before) throw new PendingJournalError("gap");
  }
  if (at !== to) throw new PendingJournalError("gap");
  return batches;
}

/** Authored batches in acceptance order, both streams. */
function byAcceptance(pending: Record<CollabField, JournalBatch[]>) {
  return [
    ...pending.body.map((batch) => ({ field: "body" as const, batch })),
    ...pending.title.map((batch) => ({ field: "title" as const, batch })),
  ].sort((a, b) => a.batch.createdAt.localeCompare(b.batch.createdAt) ||
    (a.field === b.field ? a.batch.base - b.batch.base : a.field === "body" ? -1 : 1));
}

/** The author of the last authored batch among `fields`, if any. */
function lastAuthor(pending: Record<CollabField, JournalBatch[]>, fields: readonly CollabField[]) {
  const authored = byAcceptance(pending)
    .filter(({ field, batch }) => fields.includes(field) && batch.authored && batch.authorId);
  return authored.at(-1)?.batch ?? null;
}

/**
 * The live document: `stored` with the pending steps of `fields` applied.
 * `version` counts every authored pending body batch, as each counted one
 * when it rewrote the row; the author is that of the last authored batch.
 */
function applyPending(
  stored: CollabPage,
  pending: Record<CollabField, JournalBatch[]>,
  revisions: StreamRevisions
): CollabPage {
  const ops = pageCollaborationServer();
  const page: CollabPage = {
    ...stored,
    body_revision: revisions.head.body,
    title_revision: revisions.head.title,
  };
  for (const field of COLLAB_FIELDS) {
    if (pending[field].length === 0) continue;
    const applied = ops.applyCollabSteps(field, field === "body" ? stored.content : stored.title,
      pending[field].flatMap((batch) => batch.steps));
    if (!applied.ok) throw new PendingJournalError("unreadable");
    if (field === "body") page.content = applied.doc;
    else page.title = applied.text;
  }
  page.version = stored.version + pending.body.filter((batch) => batch.authored).length;
  const author = lastAuthor(pending, COLLAB_FIELDS);
  if (author?.authorId) {
    Object.assign(page, writtenBy(author.authorId, author.authorKind, author.authorApiKeyId));
    page.updated_at = author.createdAt;
  }
  return page;
}

/** Decodes a fetched row and applies its pending steps. Only once access is established. */
async function liveFromRow(
  service: Service,
  row: Record<string, unknown>,
  actorId: string | null
): Promise<LivePage> {
  const revisions = takeStreamRevisions(row);
  const stored = await decodePage(row, actorId) as CollabPage;
  stored.body_revision = revisions.materialized.body;
  stored.title_revision = revisions.materialized.title;
  stored.content_revision = Number(row.content_revision ?? 0);
  const pending: Record<CollabField, JournalBatch[]> = { body: [], title: [] };
  await Promise.all(COLLAB_FIELDS.map(async (field) => {
    if (revisions.head[field] > revisions.materialized[field]) {
      pending[field] = await pendingBatches(service, stored, field,
        revisions.materialized[field], revisions.head[field], actorId);
    }
  }));
  return {
    page: applyPending(stored, pending, revisions),
    stored,
    revisions,
    pending,
    protect: Number(row.encryption_version ?? 0) > 0,
  };
}

/** A list row's title with its pending steps. */
async function liveTitle(
  service: Service,
  page: Page,
  revisions: StreamRevisions,
  actorId: string
): Promise<string> {
  try {
    const batches = await pendingBatches(service, page, "title",
      revisions.materialized.title, revisions.head.title, actorId);
    const applied = pageCollaborationServer().applyCollabSteps("title", page.title,
      batches.flatMap((batch) => batch.steps));
    if (applied.ok) return applied.text;
  } catch (error) {
    if (!(error instanceof PendingJournalError)) throw error;
  }
  scheduleMaterialization(getServiceClient(), page.id, { urgent: true });
  return page.title;
}

/** A live page of a project at its heads, or null. Access is the caller's. */
async function loadCollabPage(
  service: Service,
  pageId: string,
  projectId: string,
  actorId: string
): Promise<LivePage | null> {
  const row = await fetchCollabRow(service, pageId, projectId);
  return row ? liveFromRow(service, row, actorId) : null;
}

/** One stream change: steps from a session, or a whole replacement value. */
type StreamEdit =
  | {
      field: CollabField;
      steps: unknown[];
      base: number;
      batchId: string;
      clientId: string;
    }
  | {
      field: CollabField;
      /** The body JSON, or the title string. */
      replace: unknown;
    };

type StreamCommit =
  | {
      status: "accepted";
      page: CollabPage;
      previous: CollabPage;
      changed: { body: boolean; title: boolean };
      writesDocument: boolean;
    }
  | { status: "duplicate" }
  | { status: "unchanged" }
  | { status: "behind"; field: CollabField; head: number }
  | { status: "refused"; reason: CollabRefusal }
  | { status: "retry" }
  | { status: "missing" };

/**
 * Whether appended steps must be sealed even on a plaintext page: whenever
 * this deployment can seal (content encryption on, or a data root key), so
 * that page protection activating, which refuses plaintext journal rows, never
 * meets a batch it would refuse.
 */
function journalMustBeSealed(): boolean {
  return isContentEncryptionEnabled() || hasDataRootKey();
}

/** The columns a move, a pin or an icon change carry with a stream commit. */
const STREAM_METADATA = ["icon", "favorite", "parent_id", "position"] as const;

/**
 * Applies steps to a stream's value and checks the result the way every
 * write is checked. The body must already BE what the input gate lets
 * through: replaying the journal has to reproduce the stored page exactly, so
 * a normalization cannot happen silently here.
 */
function validateStreamEdit(
  field: CollabField,
  current: unknown,
  steps: readonly unknown[]
): { ok: true; value: unknown } | { ok: false; reason: CollabRefusal } {
  const ops = pageCollaborationServer();
  const applied = ops.applyCollabSteps(field, current, steps);
  if (!applied.ok) return { ok: false, reason: applied.reason };
  if (field === "title") return { ok: true, value: applied.text };
  const checked = readPageContent(applied.doc);
  if (checked === "too-large" || checked === "too-deep") return { ok: false, reason: "too-large" };
  if (checked === "refused" || !checked || !ops.sameCollabValue("body", checked, applied.doc)) {
    return { ok: false, reason: "content-refused" };
  }
  return { ok: true, value: applied.doc };
}

/**
 * Commits stream edits (and accompanying metadata) against `live`, the state
 * just read, and writes the projection at the new heads. One attempt: `retry`
 * means only the shared envelope moved, and the caller re-reads and calls
 * again; `behind` means a stream moved.
 *
 * Pending steps the written projection includes are materialized by this
 * commit; their own effects run as a materialization's would.
 *
 * `attribution: "none"` commits without signing the page or counting a body
 * write — the canonical initialization of an empty page. Everything else is
 * an authored write.
 */
async function commitPageStreams({
  service,
  live,
  actorId,
  kind,
  mcpKeyId = null,
  edits,
  metadata = {},
  attribution = "author",
}: {
  service: Service;
  live: LivePage;
  actorId: string;
  kind: PageWriteKind;
  mcpKeyId?: string | null;
  edits: StreamEdit[];
  metadata?: Record<string, unknown>;
  attribution?: "author" | "none";
}): Promise<StreamCommit> {
  const ops = pageCollaborationServer();
  const { page, stored } = live;
  const next: Record<string, unknown> = { ...page, ...metadata };
  delete next.body_revision;
  delete next.title_revision;
  const batches: CollabBatchInput[] = [];
  const changed = { body: false, title: false };
  const authored = attribution === "author";

  for (const edit of edits) {
    const head = edit.field === "body" ? page.body_revision : page.title_revision;
    const current = edit.field === "body" ? page.content : page.title;
    let steps: unknown[];
    let batchId: string;
    let clientId: string;
    if ("steps" in edit) {
      if (edit.base !== head) return { status: "behind", field: edit.field, head };
      ({ steps, batchId, clientId } = edit);
    } else {
      steps = ops.diffCollabSteps(edit.field, current, edit.replace);
      if (steps.length === 0) continue;
      batchId = crypto.randomUUID();
      clientId = serverCollabClientId();
    }
    const applied = validateStreamEdit(edit.field, current, steps);
    if (!applied.ok) return { status: "refused", reason: applied.reason };
    if (edit.field === "body") next.content = applied.value;
    else next.title = applied.value;
    changed[edit.field] = true;
    batches.push({
      field: edit.field,
      base: head,
      batchId,
      clientId,
      steps,
      authorId: actorId,
      authorKind: kind,
      authorApiKeyId: kind === "agent" ? mcpKeyId : null,
      authored,
    });
  }
  if (batches.length === 0) return { status: "unchanged" };

  // A sealed page stays sealed: its journal batches can be sealed while the
  // envelope is, the two key reads running side by side instead of in turn.
  const sealedAhead = live.protect ? sealCollabBatches(page.id, page.project_id, batches, true) : null;
  void sealedAhead?.catch(() => {});
  const writesDocument = authored && (changed.body || changed.title || "icon" in metadata);
  // Encoded from the live document: on a sealed page the envelope carries
  // both streams, so it also materializes their pending steps.
  const encoded = await encodePage(next, { service });
  const protect = Number(encoded.encryption_version ?? 0) > 0;
  const absorbed = {
    body: changed.body || (protect && live.pending.body.length > 0),
    title: changed.title || (protect && live.pending.title.length > 0),
  };
  const values: Record<string, unknown> = protect ? pageContentValues(encoded) : {};
  if (!protect) {
    if (changed.body) values.content = next.content;
    if (changed.title) values.title = next.title;
    if ("icon" in metadata) values.icon = next.icon;
  }
  for (const key of STREAM_METADATA) {
    if (key !== "icon" && key in metadata) values[key] = metadata[key];
  }
  // The body version counts this write and the authored pending body batches
  // the projection now includes; the stored page counted neither.
  const version = stored.version +
    (absorbed.body ? live.pending.body.filter((batch) => batch.authored).length : 0) +
    (authored && changed.body ? 1 : 0);
  if (version !== stored.version) values.version = version;
  next.version = version;
  const absorbedAuthor = lastAuthor(live.pending,
    COLLAB_FIELDS.filter((field) => absorbed[field]));
  if (writesDocument) {
    Object.assign(values, writtenBy(actorId, kind, mcpKeyId));
    Object.assign(next, writtenBy(actorId, kind, mcpKeyId));
  } else if (absorbedAuthor?.authorId) {
    Object.assign(values, writtenBy(absorbedAuthor.authorId, absorbedAuthor.authorKind,
      absorbedAuthor.authorApiKeyId));
  }
  const sealed = sealedAhead && protect ? await sealedAhead : undefined;

  const outcome = await commitCollaboration(service, {
    pageId: page.id,
    projectId: page.project_id,
    contentRevision: stored.content_revision,
    values,
    batches,
    // A stream without a batch here: the projection reflects its head when
    // it absorbed that stream's pending steps, its stored revision otherwise.
    materialized: {
      body: absorbed.body ? live.revisions.head.body : live.revisions.materialized.body,
      title: absorbed.title ? live.revisions.head.title : live.revisions.materialized.title,
    },
    protect,
    sealed,
  });
  switch (outcome.status) {
    case "accepted": {
      for (const field of COLLAB_FIELDS) {
        if (!changed[field]) continue;
        rememberStreamValue(page.id, page.project_id, field,
          field === "body" ? outcome.bodyRevision : outcome.titleRevision,
          field === "body" ? next.content : next.title, protect);
      }
      materializationEffects(service, live, COLLAB_FIELDS.filter((field) =>
        absorbed[field] && live.pending[field].length > 0));
      return {
        status: "accepted",
        page: {
          ...(next as unknown as CollabPage),
          body_revision: outcome.bodyRevision,
          title_revision: outcome.titleRevision,
          content_revision: stored.content_revision + 1,
          updated_at: new Date().toISOString(),
        },
        previous: page,
        changed,
        writesDocument,
      };
    }
    case "duplicate":
      return { status: "duplicate" };
    case "behind":
      return { status: "behind", field: outcome.field, head: outcome.head };
    case "batch_reused":
      return { status: "refused", reason: "batch-reused" };
    case "retry":
      return { status: "retry" };
    case "missing":
      return { status: "missing" };
  }
}

/**
 * Within this window, a batch from the author of the previous write CONTINUES
 * that write: its history snapshot and its activity line already exist.
 */
const TYPING_CONTINUATION_MS = 60_000;

/**
 * The side effects of an accepted commit — the rules of this module's header,
 * on the authority path. A change of author, an agent write or a replacement
 * is never coalesced away.
 */
function afterStreamCommit({
  service,
  commit,
  actorId,
  kind,
  mcpKeyId,
  alwaysArchive = false,
  announce = true,
}: {
  service: Service;
  commit: Extract<StreamCommit, { status: "accepted" }>;
  actorId: string;
  kind: PageWriteKind;
  mcpKeyId?: string | null;
  alwaysArchive?: boolean;
  announce?: boolean;
}): void {
  const { page, previous, changed, writesDocument } = commit;
  if (changed.body) {
    queueSearchText(service, [page.id]);
    queuePageBodyLinks(service, [page.id]);
    if (writesDocument) {
      stampPageWrite({ service, previous, actorId, kind, always: alwaysArchive });
    }
  }
  if (writesDocument && announce) {
    announcePageWrite({
      service,
      page,
      previous,
      actorId,
      kind,
      mcpKeyId,
      event: "page_updated",
      scanMentions: changed.body,
    });
  }
}

/* ─── Materialization ─────────────────────────────────────────────────────── */

/** How long a page must stay quiet before its appended typing is materialized. */
const MATERIALIZE_QUIET_MS = 2_000;

/** Pending steps (both streams) that materialize at once, without waiting for quiet. */
const MATERIALIZE_MAX_PENDING_STEPS = 400;

/** A pending step this old materializes at once: continuous typing never goes quiet. */
const MATERIALIZE_MAX_PENDING_MS = 10_000;

/** The cron safety net takes pages whose oldest pending step is this old. */
export const MATERIALIZE_STALE_MS = 15_000;

/** Author alternations whose mentions are attributed exactly in one materialization. */
const MATERIALIZE_MAX_MENTION_RUNS = 64;

const materializeGenerations = new Map<string, number>();
const materializing = new Map<string, Promise<void>>();

/**
 * Asks for a materialization of `pageId` after the quiet period, only the
 * newest request of this instance running; `urgent` also runs one at once
 * unless one is already running here. Instances do not coordinate: two
 * materializations of one page race on the envelope CAS, and the loser finds
 * nothing left to do.
 */
function scheduleMaterialization(
  service: Service,
  pageId: string,
  { urgent = false }: { urgent?: boolean } = {}
): void {
  const generation = (materializeGenerations.get(pageId) ?? 0) + 1;
  materializeGenerations.set(pageId, generation);
  afterOrNow(async () => {
    if (urgent && !materializing.has(pageId)) await runMaterialization(service, pageId);
    await new Promise((resolve) => setTimeout(resolve, MATERIALIZE_QUIET_MS));
    if (materializeGenerations.get(pageId) !== generation) return;
    materializeGenerations.delete(pageId);
    await runMaterialization(service, pageId);
  });
}

/** One materialization of a page at a time on this instance; waits for a running one first. */
async function runMaterialization(service: Service, pageId: string): Promise<void> {
  const running = materializing.get(pageId);
  if (running) await running;
  const task = materializePage(service, pageId).then(() => {}, (error: unknown) => {
    console.error("[pages] materialization failed:", (error as Error).message);
  }).finally(() => {
    if (materializing.get(pageId) === task) materializing.delete(pageId);
  });
  materializing.set(pageId, task);
  await task;
}

/**
 * Writes the projection of a page's pending steps into its row: the stored
 * page plus the journal, re-sealed once, under the envelope CAS. A concurrent
 * envelope writer (a database cell, another materialization) makes it read
 * again. A journal that cannot bridge the materialized revision and the head
 * — it should never happen — is repaired by a gap: connected editors reset to
 * the stored page.
 */
export async function materializePage(
  service: Service,
  pageId: string
): Promise<"materialized" | "unchanged" | "missing" | "reset" | "stale"> {
  // A gap seen at the same materialized revisions on two consecutive reads.
  let gapAt: string | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await fetchCollabRow(service, pageId, null, { includeTrashed: true });
    if (!row) return "missing";
    const at = `${row.body_revision}:${row.title_revision}:${row.content_revision}`;
    let live: LivePage;
    try {
      live = await liveFromRow(service, row, null);
    } catch (error) {
      if (!(error instanceof PendingJournalError)) throw error;
      // Steps this code cannot apply: a newer deployment will. Never discard
      // acknowledged typing for it.
      if (error.kind === "unreadable") {
        console.error("[pages] pending steps unreadable by this deployment");
        return "stale";
      }
      // A racing materialization prunes rows below ITS revision after this
      // read: read again. Only the same gap on an unchanged row is proven.
      if (gapAt !== at) {
        gapAt = at;
        continue;
      }
      console.error("[pages] pending journal gap confirmed; opening a gap");
      await resetCollaboration(service, pageId);
      return "reset";
    }
    if (!hasPendingSteps(live.revisions)) return "unchanged";

    const next: Record<string, unknown> = { ...live.page };
    delete next.body_revision;
    delete next.title_revision;
    const encoded = await encodePage(next, { service });
    const protect = Number(encoded.encryption_version ?? 0) > 0;
    const values: Record<string, unknown> = protect ? pageContentValues(encoded) : {};
    if (!protect) {
      if (live.pending.body.length > 0) values.content = next.content;
      if (live.pending.title.length > 0) values.title = next.title;
    }
    if (live.page.version !== live.stored.version) values.version = live.page.version;
    const author = lastAuthor(live.pending, COLLAB_FIELDS);
    if (author?.authorId) {
      Object.assign(values, writtenBy(author.authorId, author.authorKind, author.authorApiKeyId));
    }

    const outcome = await materializeCollaboration(service, {
      pageId,
      contentRevision: live.stored.content_revision,
      values,
      revisions: live.revisions.head,
    });
    switch (outcome.status) {
      case "materialized":
        materializationEffects(service, live, COLLAB_FIELDS.filter((field) =>
          live.pending[field].length > 0));
        scheduleRoutineEvents();
        return "materialized";
      case "unchanged":
        return "unchanged";
      case "missing":
        return "missing";
      case "retry":
        continue;
    }
  }
  return "stale";
}

/**
 * The effects of appended typing, once it is in the row: what each batch used
 * to do when it rewrote the page, at the granularity of a materialization.
 *
 * - Search text and links are reprojected once.
 * - The stored state is archived as covered by the first author, with the
 *   usual coalescing (`stampPageWrite`): one author typing continuously keeps
 *   one history line per five minutes, and a different author always gets
 *   one. Intermediate states inside one materialization (a few seconds) are
 *   not archived separately.
 * - Each author's activity line is recorded once, unless they continue the
 *   stored write (same author, less than a minute ago).
 * - New mentions are announced per run of one author's batches, so each is
 *   attributed to whoever typed it. Beyond `MATERIALIZE_MAX_MENTION_RUNS`
 *   alternations, later runs are not scanned (logged).
 */
function materializationEffects(
  service: Service,
  live: LivePage,
  fields: readonly CollabField[]
): void {
  if (fields.length === 0) return;
  const { stored, page } = live;
  const pending = {
    body: fields.includes("body") ? live.pending.body : [],
    title: fields.includes("title") ? live.pending.title : [],
  };
  if (pending.body.length > 0) {
    queueSearchText(service, [page.id]);
    queuePageBodyLinks(service, [page.id]);
  }
  const ordered = byAcceptance(pending);
  const authored = ordered.filter(({ batch }) => batch.authored && batch.authorId);
  if (authored.length === 0) return;

  const first = authored[0].batch;
  if (pending.body.some((batch) => batch.authored)) {
    stampPageWrite({ service, previous: stored, actorId: first.authorId!, kind: first.authorKind });
  }

  // Runs of consecutive batches by one author. An unattributed batch
  // (a presentation rebuild) closes the run and belongs to none.
  const ops = pageCollaborationServer();
  const scanMentions = pending.body.length > 0 &&
    JSON.stringify(page.content ?? null).includes("@");
  type Run = { batch: JournalBatch; before: unknown; after: unknown; body: boolean };
  const runs: Run[] = [];
  let doc: unknown = stored.content;
  let buffer: unknown[] = [];
  let run: Run | null = null;
  let truncated = false;
  const flush = () => {
    if (buffer.length > 0 && scanMentions && !truncated) {
      const applied = ops.applyCollabSteps("body", doc, buffer);
      if (applied.ok) doc = applied.doc;
      else truncated = true;
    }
    buffer = [];
    if (run) run.after = doc;
  };
  for (const { field, batch } of ordered) {
    const key = batch.authored && batch.authorId
      ? `${batch.authorId}:${batch.authorKind}:${batch.authorApiKeyId ?? ""}` : null;
    const runKey = run ? `${run.batch.authorId}:${run.batch.authorKind}:${run.batch.authorApiKeyId ?? ""}` : null;
    if (key !== runKey) {
      flush();
      run = null;
      if (key) {
        if (runs.length >= MATERIALIZE_MAX_MENTION_RUNS) truncated = true;
        run = { batch, before: doc, after: doc, body: false };
        runs.push(run);
      }
    }
    if (field === "body") {
      buffer.push(...batch.steps);
      if (run) run.body = true;
    }
  }
  flush();
  if (truncated && scanMentions) {
    console.warn("[pages] materialization mention scan truncated");
  }

  const announced = new Set<string>();
  for (const [index, current] of runs.entries()) {
    const { authorId, authorKind, authorApiKeyId } = current.batch;
    if (!authorId) continue;
    const continuing = authorKind === "human" && stored.updated_by === authorId &&
      stored.updated_kind === authorKind &&
      Date.now() - Date.parse(stored.updated_at) < TYPING_CONTINUATION_MS;
    const activity = !continuing && !announced.has(authorId);
    announced.add(authorId);
    const scanned = scanMentions && current.body &&
      !(truncated && index >= MATERIALIZE_MAX_MENTION_RUNS);
    if (!activity && !scanned) continue;
    announcePageWrite({
      service,
      page: { ...page, content: scanned ? current.after as JSONContent : page.content },
      previous: { ...stored, content: scanned ? current.before as JSONContent : stored.content },
      actorId: authorId,
      kind: authorKind,
      mcpKeyId: authorApiKeyId,
      event: "page_updated",
      scanMentions: scanned,
      activity,
    });
  }
}

/**
 * Materializes the pages among `pageIds` that have pending steps, for a
 * reader that needs the latest text in the row itself (exports, publication,
 * duplication, the file sweep). One indexed read when nothing is pending.
 */
export async function materializePendingPages(
  service: Service,
  pageIds: readonly string[]
): Promise<number> {
  const ids = [...new Set(pageIds)];
  let count = 0;
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await service
      .from("page_collaboration_heads")
      .select("page_id")
      .in("page_id", ids.slice(offset, offset + 200))
      .not("pending_since", "is", null);
    if (error) throw new Error(`pending collaboration read failed: ${error.message}`);
    const pending = [...new Set((data ?? []).map((row) => row.page_id as string))];
    await Promise.all(pending.map((pageId) => runMaterialization(service, pageId)));
    count += pending.length;
  }
  return count;
}

/** `materializePendingPages` for every page of these projects. */
export async function materializePendingProjectPages(
  service: Service,
  projectIds: readonly string[]
): Promise<number> {
  const ids = [...new Set(projectIds)];
  if (ids.length === 0) return 0;
  const pending = new Set<string>();
  for (let offset = 0; ; offset += 1_000) {
    const { data, error } = await service
      .from("page_collaboration_heads")
      .select("page_id")
      .in("project_id", ids)
      .not("pending_since", "is", null)
      .order("page_id")
      .order("field")
      .range(offset, offset + 999);
    if (error) throw new Error(`pending collaboration read failed: ${error.message}`);
    for (const row of data ?? []) pending.add(row.page_id as string);
    if (!data || data.length < 1_000) break;
  }
  for (let offset = 0; offset < pending.size; offset += 10) {
    await Promise.all([...pending].slice(offset, offset + 10)
      .map((pageId) => runMaterialization(service, pageId)));
  }
  return pending.size;
}

/**
 * The cron safety net: materializes pages whose pending steps are older than
 * `MATERIALIZE_STALE_MS`, for instance when the instance that accepted them
 * stopped before its scheduled materialization ran.
 */
export async function materializeStalePages({
  limit = 50,
  olderThanMs = MATERIALIZE_STALE_MS,
}: { limit?: number; olderThanMs?: number } = {}): Promise<{
  pages: number;
  materialized: number;
  failed: number;
}> {
  const service = getServiceClient();
  const pageIds = await listPendingCollaborations(service, olderThanMs, limit);
  let materialized = 0;
  let failed = 0;
  for (let offset = 0; offset < pageIds.length; offset += 5) {
    await Promise.all(pageIds.slice(offset, offset + 5).map(async (pageId) => {
      try {
        if (await materializePage(service, pageId) === "materialized") materialized += 1;
      } catch (error) {
        failed += 1;
        console.error("[pages] stale materialization failed:", (error as Error).message);
      }
    }));
  }
  return { pages: pageIds.length, materialized, failed };
}

/* ─── Sessions ────────────────────────────────────────────────────────────── */

/** A snapshot of both streams at their heads, from one row read. */
function collaborationSnapshot(page: CollabPage): PageCollaborationSnapshot {
  return {
    protocol: PAGE_COLLABORATION_PROTOCOL,
    pageId: page.id,
    projectId: page.project_id,
    body: { revision: page.body_revision, doc: page.content as JSONContent },
    title: { revision: page.title_revision, text: page.title },
    version: page.version,
    updatedAt: page.updated_at,
  };
}

type CollabFailure = { ok: false; status: number; errorKey: PageErrorKey };

/**
 * A fresh access decision for a collaboration request and the token that
 * stands for it (see lib/server/page-collaboration-token.ts).
 */
async function decideCollaboration(
  service: Service,
  ids: { userId: string; pageId: string; projectId: string }
): Promise<{ grant: CollabGrant; token: string } | null> {
  const grant = await decideCollaborationGrant(service, ids);
  return grant ? { grant, token: mintCollaborationToken(grant) } : null;
}

/**
 * The document a collaboration session starts from, and its first token.
 *
 * Any member who can read the page can open it. If the stored body is not yet
 * canonical — an empty page from `createPage`, blocks without IDs, content the
 * input gate would normalize — the canonical form is committed FIRST, once,
 * under the authority's CAS, so every client receives the same revision-zero
 * document. That initialization is not an authored write: it neither signs the
 * page nor counts as a body version, which is also why a reader may trigger it.
 */
export async function readPageCollaborationSnapshot(
  projectId: string,
  pageId: string,
  actorId: string
): Promise<{ ok: true; snapshot: PageCollaborationSnapshot; token: string } | CollabFailure> {
  const service = getServiceClient();
  const decision = await decideCollaboration(service, { userId: actorId, pageId, projectId });
  if (!decision) return { ok: false, status: 404, errorKey: "projectNotFound" };
  const ops = pageCollaborationServer();
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const live = await loadCollabPage(service, pageId, projectId, actorId);
    if (!live) return { ok: false, status: 404, errorKey: "pageNotFound" };
    const { page } = live;
    const ready = { ok: true as const, snapshot: collaborationSnapshot(page), token: decision.token };
    const checked = readPageContent(page.content);
    const basis = checked && typeof checked === "object" ? checked : page.content;
    const canonical = ops.canonicalBodyJSON(basis);
    if (ops.sameCollabValue("body", canonical, page.content)) return ready;
    let commit: StreamCommit;
    try {
      commit = await commitPageStreams({
        service,
        live,
        actorId,
        kind: "human",
        edits: [{ field: "body", replace: canonical }],
        attribution: "none",
      });
    } catch (error) {
      console.error("[pages] collaboration initialization failed:", (error as Error).message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    // A stored body the gate refuses cannot be initialized; serve it as it is.
    if (commit.status === "refused") return ready;
    if (commit.status === "missing") return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  return { ok: false, status: 409, errorKey: "pageStale" };
}

/**
 * Accepted steps of one stream after `since`, or a reset when the journal
 * cannot bridge the gap (compacted, or a writer replaced the page without
 * steps). The head is read first: steps committed after it are left for the
 * next read rather than mixed with an older head. Every catch-up decides
 * access afresh and renews the session's token.
 */
export async function readPageCollaborationSteps({
  projectId,
  pageId,
  actorId,
  field,
  since,
}: {
  projectId: string;
  pageId: string;
  actorId: string;
  field: CollabField;
  since: number;
}): Promise<{ ok: true; catchUp: CollabCatchUp; token: string } | CollabFailure> {
  const service = getServiceClient();
  // The head and the journal are fetched while access is decided, sealed;
  // nothing is decrypted before access is confirmed, and a denial aborts both.
  // Fetched side by side, a journal read can miss a batch the head already
  // counts; that case is read again below rather than reset.
  const abort = new AbortController();
  const headRead = withSupabaseAbortSignal(abort.signal, () => Promise.resolve(service
    .from("page_collaboration_heads")
    .select("revision, pages!inner(deleted_at)")
    .eq("page_id", pageId)
    .eq("project_id", projectId)
    .eq("field", field)
    .is("pages.deleted_at", null)
    .maybeSingle()
    .then((result) => result)));
  const journalRead = withSupabaseAbortSignal(abort.signal,
    () => fetchCollaborationJournal(service, { pageId, projectId, field, since }));
  void headRead.catch(() => {});
  void journalRead.catch(() => {});
  let decision: Awaited<ReturnType<typeof decideCollaboration>>;
  try {
    decision = await decideCollaboration(service, { userId: actorId, pageId, projectId });
  } catch (error) {
    abort.abort();
    throw error;
  }
  if (!decision) {
    abort.abort();
    return { ok: false, status: 404, errorKey: "projectNotFound" };
  }
  const { data, error } = await headRead;
  if (error) return { ok: false, status: 500, errorKey: "databaseError" };
  if (!data) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const head = Number((data as Record<string, unknown>).revision ?? 0);

  const reset = async (reason: "gap" | "ahead") => {
    const fresh = await readPageCollaborationSnapshot(projectId, pageId, actorId);
    if (!fresh.ok) return fresh;
    return {
      ok: true as const,
      catchUp: { kind: "reset" as const, reason, snapshot: fresh.snapshot },
      token: fresh.token,
    };
  };
  if (since > head) return reset("ahead");
  if (since === head) {
    return {
      ok: true,
      catchUp: { kind: "steps", field, from: since, to: head, head, steps: [], clientIds: [] },
      token: decision.token,
    };
  }
  // The journal was read alongside the head: a batch accepted between the two
  // reads shows in the head but not in the rows. Read the journal again,
  // after the head, before calling it a gap.
  let rows = await decodeCollaborationJournal(await journalRead, projectId, actorId);
  let assembled = assembleCollabSteps(field, since, head, rows);
  if ("gap" in assembled) {
    rows = await readCollaborationJournal(service, { pageId, projectId, field, since, actorId });
    assembled = assembleCollabSteps(field, since, head, rows);
  }
  if ("gap" in assembled) return reset("gap");
  return { ok: true, catchUp: { kind: "steps", ...assembled }, token: decision.token };
}

/**
 * A session's batch of steps, APPENDED: journaled and acknowledged without
 * rewriting the page row, which a later materialization does.
 *
 * Access comes from the session's collaboration token when it is valid, so a
 * batch makes no access query; the commit compares the membership generation
 * the token was issued at, so a membership change is refused at once and
 * decided afresh. A missing, expired or ageing token is replaced by a fresh
 * decision, returned as `token`. The account itself is authenticated live by
 * the route on every request.
 *
 * The document the steps apply to comes from this instance's cache when it
 * holds the base revision (the typist's previous batch usually landed here),
 * and from the row and its pending steps otherwise.
 */
export async function submitPageCollaboration({
  projectId,
  pageId,
  actorId,
  submission,
  token = null,
}: {
  projectId: string;
  pageId: string;
  actorId: string;
  submission: CollabSubmission;
  token?: string | null;
}): Promise<{ ok: true; result: CollabSubmitResult; token: string | null } | CollabFailure> {
  const service = getServiceClient();
  const ids = { userId: actorId, pageId, projectId };
  const { field } = submission;
  let grant = verifyCollaborationToken(token, ids);
  let issued: string | null = null;
  let deciding = !grant || grantNeedsRenewal(grant) ? decideCollaboration(service, ids) : null;
  void deciding?.catch(() => {});
  const settle = async (): Promise<CollabFailure | null> => {
    if (!deciding) return null;
    const decision = await deciding;
    deciding = null;
    if (!decision) return { ok: false, status: 404, errorKey: "projectNotFound" };
    grant = decision.grant;
    issued = decision.token;
    return decision.grant.canWrite ? null : { ok: false, status: 403, errorKey: "readOnlyProject" };
  };
  try {
    if (!grant) {
      const refusal = await settle();
      if (refusal) return refusal;
    }
    if (!grant!.canWrite) return { ok: false, status: 403, errorKey: "readOnlyProject" };

    let sealAnyway = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      let current = cachedStreamValue(pageId, projectId, field, submission.base);
      if (!current) {
        const live = await loadCollabPage(service, pageId, projectId, actorId);
        if (!live) return { ok: false, status: 404, errorKey: "pageNotFound" };
        // A retry of a batch that was accepted (its response was lost) is
        // acknowledged again — before comparing revisions, which have moved since.
        const head = field === "body" ? live.page.body_revision : live.page.title_revision;
        const value = field === "body" ? live.page.content : live.page.title;
        const protect = live.protect || journalMustBeSealed();
        rememberStreamValue(pageId, projectId, field, head, value, protect);
        if (submission.base !== head) {
          const receipt = await findCollaborationReceipt(service, {
            pageId, projectId, batchId: submission.batchId,
          });
          if (receipt) {
            const same = receipt.field === field && receipt.base === submission.base &&
              receipt.stepCount === submission.steps.length;
            return {
              ok: true,
              token: issued,
              result: same
                ? { status: "accepted", revision: submission.base + submission.steps.length }
                : { status: "refused", reason: "batch-reused" },
            };
          }
          return { ok: true, token: issued, result: { status: "behind", head } };
        }
        current = { value, protect };
      }

      if (submission.presentation) {
        const applied = pageCollaborationServer().applyCollabSteps("body", current.value, submission.steps);
        if (applied.ok) {
          // Rebuilding mention pills changes nodes, never what the page SAYS.
          const [before, after] = await Promise.all([
            pageBodyToMarkdownServer(current.value as JSONContent | null),
            pageBodyToMarkdownServer(applied.doc),
          ]);
          if (before !== after) {
            console.warn("[pages] collaboration batch refused: presentation-changed");
            return { ok: true, token: issued, result: { status: "refused", reason: "presentation-changed" } };
          }
        }
      }

      const validated = validateStreamEdit(field, current.value, submission.steps);
      if (!validated.ok) {
        // Content-free: why a session's steps were refused, never the steps.
        console.warn("[pages] collaboration batch refused:", validated.reason, field,
          submission.presentation ? "presentation" : "edit");
        return { ok: true, token: issued, result: { status: "refused", reason: validated.reason } };
      }
      const sealed = await sealCollabBatches(pageId, projectId, [{
        field,
        base: submission.base,
        batchId: submission.batchId,
        clientId: submission.clientId,
        steps: submission.steps,
        authorId: actorId,
        authorKind: "human",
        authorApiKeyId: null,
        authored: !submission.presentation,
      }], current.protect || sealAnyway);
      // A renewal decided alongside must agree before anything is written.
      const refusal = await settle();
      if (refusal) return refusal;

      let outcome: Awaited<ReturnType<typeof appendCollaboration>>;
      try {
        outcome = await appendCollaboration(service, {
          pageId, projectId, generation: grant!.generation, sealed,
        });
      } catch (error) {
        // A page sealed since this instance cached it, or page protection
        // activated meanwhile: read it again and seal.
        if (error instanceof CollabCommitError && error.code === "23514" &&
            (error.message === "page_collaboration_plaintext_refused" ||
              error.message === "page_collaboration_requires_encryption")) {
          forgetStreamValues(pageId);
          sealAnyway = true;
          continue;
        }
        throw error;
      }
      switch (outcome.status) {
        case "accepted": {
          const revision = field === "body" ? outcome.bodyRevision : outcome.titleRevision;
          rememberStreamValue(pageId, projectId, field, revision, validated.value, current.protect);
          scheduleMaterialization(service, pageId, {
            urgent: outcome.pending >= MATERIALIZE_MAX_PENDING_STEPS ||
              outcome.pendingMs >= MATERIALIZE_MAX_PENDING_MS,
          });
          return { ok: true, token: issued, result: { status: "accepted", revision } };
        }
        case "duplicate":
          return {
            ok: true,
            token: issued,
            result: { status: "accepted", revision: submission.base + submission.steps.length },
          };
        case "behind":
          return { ok: true, token: issued, result: { status: "behind", head: outcome.head } };
        case "batch_reused":
          return { ok: true, token: issued, result: { status: "refused", reason: "batch-reused" } };
        case "missing":
          return { ok: false, status: 404, errorKey: "pageNotFound" };
        case "revoked": {
          // Membership changed since the token (anyone's, not necessarily
          // this account's): decide again, then send again.
          deciding = decideCollaboration(service, ids);
          const again = await settle();
          if (again) return again;
          continue;
        }
        case "retry":
          continue;
        case "backlog":
          // Too much typing awaits materialization: write it, then append.
          await runMaterialization(service, pageId);
          continue;
      }
    }
  } catch (error) {
    console.error("[pages] collaboration commit failed:", (error as Error).message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  const head = await service.from("page_collaboration_heads").select("revision")
    .eq("page_id", pageId).eq("project_id", projectId).eq("field", field).maybeSingle();
  if (!head.data) return { ok: false, status: 404, errorKey: "pageNotFound" };
  return {
    ok: true,
    token: issued,
    result: { status: "behind", head: Number(head.data.revision) },
  };
}

/**
 * The steps accepted on the body between two revisions, or `null` when the
 * journal no longer bridges them (compacted, or a writer that recorded none).
 */
async function bodyStepsBetween(
  service: Service,
  page: CollabPage,
  from: number,
  to: number,
  actorId: string
): Promise<unknown[] | null> {
  const steps: unknown[] = [];
  let at = from;
  while (at < to) {
    const rows = await readCollaborationJournal(service, {
      pageId: page.id, projectId: page.project_id, field: "body", since: at, actorId,
    });
    const chunk = assembleCollabSteps("body", at, to, rows);
    if ("gap" in chunk || chunk.to <= at) return null;
    steps.push(...chunk.steps);
    at = chunk.to;
  }
  return steps;
}

/**
 * A targeted body edit by Numo or an MCP agent, made the way a second person
 * typing would make it (MIN-688).
 *
 * `derive` turns the body as read into the body the agent wants. The
 * difference becomes a few small steps (`diffCollabSteps`: only the words and
 * blocks that changed), computed against the revision that was read. When
 * people keep typing meanwhile, those steps are REBASED onto the steps
 * accepted since — exactly what a browser does with a late batch — instead
 * of failing on a version check or overwriting anything. A collaborator's
 * text, even inside the passage, is kept like a parallel edit's. Only when
 * the journal cannot bridge the gap is the edit derived again from the
 * current text, where it may then be refused (its passage is gone).
 *
 * A rebase can drop steps whose text a collaborator deleted meanwhile. The
 * result says so: `partial` when some of the edit was applied, and
 * `pageStale` when none of it was, so the agent re-reads instead of
 * reporting an edit that did not happen.
 */
export async function editPageBodyLive<R>({
  pageId,
  projectId,
  actorId,
  kind = "agent",
  mcpKeyId = null,
  derive,
}: {
  pageId: string;
  /** The expected project: a page of another project answers 404. */
  projectId?: string;
  actorId: string;
  kind?: PageWriteKind;
  mcpKeyId?: string | null;
  derive: (current: JSONContent | null) => Promise<{ doc: JSONContent } | { refusal: R }>;
}): Promise<(PageResult<Page> & { partial?: boolean }) | { ok: false; refusal: R }> {
  const service = getServiceClient();
  const located = await loadPage(service, pageId, actorId);
  if (!located || (projectId && located.project_id !== projectId)) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  const refusal = await pageWriteRefusal(actorId, located.project_id, "pageNotFound");
  if (refusal) return refusal;
  const ops = pageCollaborationServer();

  let live = await loadCollabPage(service, pageId, located.project_id, actorId);
  if (!live) return { ok: false, status: 404, errorKey: "pageNotFound" };
  let basis = live.page.content as JSONContent | null;
  let revision = live.page.body_revision;
  const stepsFrom = async (current: JSONContent | null) => {
    const derived = await derive(current);
    if ("refusal" in derived) return derived;
    return { steps: ops.diffCollabSteps("body", current, ops.canonicalBodyJSON(derived.doc)) };
  };
  let planned = await stepsFrom(basis);
  if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
  let steps = planned.steps;
  let dropped = 0;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (steps.length === 0) return { ok: true, page: located };
    if (attempt > 0) {
      const current = await loadCollabPage(service, pageId, located.project_id, actorId);
      if (!current) return { ok: false, status: 404, errorKey: "pageNotFound" };
      if (current.page.body_revision !== revision) {
        const over = await bodyStepsBetween(service, current.page, revision,
          current.page.body_revision, actorId);
        if (over) {
          const rebased = ops.rebaseCollabSteps("body", basis, steps, over);
          dropped += steps.length - rebased.length;
          steps = rebased;
        } else {
          // Re-derived from the current text: what was dropped before is
          // planned again or already there, so only this derivation counts.
          planned = await stepsFrom(current.page.content as JSONContent | null);
          if ("refusal" in planned) return { ok: false, refusal: planned.refusal };
          steps = planned.steps;
          dropped = 0;
        }
        basis = current.page.content as JSONContent | null;
        revision = current.page.body_revision;
      }
      live = current;
      if (steps.length === 0) {
        // Everything the agent meant to change was changed by someone else.
        return dropped > 0
          ? { ok: false, status: 409, errorKey: "pageStale" }
          : { ok: true, page: located };
      }
    }
    let commit: StreamCommit;
    try {
      commit = await commitPageStreams({
        service,
        live,
        actorId,
        kind,
        mcpKeyId,
        edits: [{
          field: "body",
          steps,
          base: revision,
          batchId: crypto.randomUUID(),
          clientId: serverCollabClientId(),
        }],
      });
    } catch (error) {
      console.error("[pages] live agent edit failed:", (error as Error).message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    switch (commit.status) {
      case "accepted": {
        afterStreamCommit({ service, commit, actorId, kind, mcpKeyId });
        scheduleRoutineEvents();
        const fresh = await loadPage(service, pageId, actorId);
        return { ok: true, page: fresh ?? commit.page, ...(dropped > 0 ? { partial: true } : {}) };
      }
      case "refused":
        return commit.reason === "too-large"
          ? { ok: false, status: 413, errorKey: "pageTooLarge" }
          : { ok: false, status: 400, errorKey: "pageContentRefused" };
      case "missing":
        return { ok: false, status: 404, errorKey: "pageNotFound" };
      default:
        // `behind` or `retry`: catch up and rebase on the next attempt.
        continue;
    }
  }
  return { ok: false, status: 409, errorKey: "pageStale" };
}

/* ─── Modification ─────────────────────────────────────────────────────────── */

/**
 * The stream half of `updatePage`: the body and/or the title of `patch` as
 * replacements, plus the metadata of the same request, committed together.
 * A version-guarded write (an older tab's PATCH) still fails when the body
 * moved since its base; an unguarded one (Numo, the MCP, a restore) is
 * recomputed against the current page on each attempt, which is exactly an
 * explicit replacement.
 */
async function updatePageThroughStreams({
  service,
  page: first,
  actorId,
  kind,
  mcpKeyId,
  alwaysArchive,
  expected,
  patch,
}: {
  service: Service;
  page: Page;
  actorId: string;
  kind: PageWriteKind;
  mcpKeyId?: string | null;
  alwaysArchive: boolean;
  expected: number | null;
  patch: Record<string, unknown>;
}): Promise<PageResult<Page> | "unchanged"> {
  const ops = pageCollaborationServer();
  const metadata = Object.fromEntries(
    STREAM_METADATA.filter((key) => key in patch).map((key) => [key, patch[key]]));
  const edits: StreamEdit[] = [];
  if (patch.content !== undefined) {
    edits.push({ field: "body", replace: ops.canonicalBodyJSON(patch.content) });
  }
  if (patch.title !== undefined) edits.push({ field: "title", replace: patch.title });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const live = await loadCollabPage(service, first.id, first.project_id, actorId);
    if (!live) return { ok: false, status: 404, errorKey: "pageNotFound" };
    const { page } = live;
    if (expected !== null && expected !== page.version) {
      return { ok: false, status: 409, errorKey: "pageStale", conflict: page };
    }
    let commit: StreamCommit;
    try {
      commit = await commitPageStreams({ service, live, actorId, kind, mcpKeyId, edits, metadata });
    } catch (error) {
      // The same refusal the plain update reports, raised by the database
      // guard on a move inside the commit.
      if (error instanceof CollabCommitError && error.code === "23514" &&
          error.message === "Database entries with values cannot change parent") {
        return { ok: false, status: 409, errorKey: "pageDatabaseMove" };
      }
      console.error("[pages] stream commit failed:", (error as Error).message);
      return { ok: false, status: 500, errorKey: "databaseError" };
    }
    switch (commit.status) {
      case "accepted": {
        afterStreamCommit({ service, commit, actorId, kind, mcpKeyId, alwaysArchive });
        scheduleRoutineEvents();
        const fresh = await loadPage(service, page.id, actorId);
        return { ok: true, page: fresh ?? commit.page };
      }
      case "unchanged":
        return "unchanged";
      case "refused":
        return commit.reason === "too-large"
          ? { ok: false, status: 413, errorKey: "pageTooLarge" }
          : { ok: false, status: 400, errorKey: "pageContentRefused" };
      case "missing":
        return { ok: false, status: 404, errorKey: "pageNotFound" };
      case "duplicate":
      case "behind":
      case "retry":
        continue;
    }
  }
  const fresh = await loadPage(service, first.id, actorId);
  return fresh
    ? { ok: false, status: 409, errorKey: "pageStale", conflict: fresh }
    : { ok: false, status: 404, errorKey: "pageNotFound" };
}

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
  attempt = 0,
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
  /** Internal: retries of a metadata write whose shared envelope moved. */
  attempt?: number;
}): Promise<PageResult<Page>> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const refusal = await pageWriteRefusal(actorId, page.project_id, "pageNotFound");
  if (refusal) return refusal;

  const patch: Record<string, unknown> = {};

  const title = readTitle(input.title);
  if (title !== undefined) patch.title = title;

  if ("icon" in input) patch.icon = readIcon(input.icon);

  // The favorite is a NU boolean: shared by the project, it has neither order nor
  // owner to write next to it (see the `pages_favorite` migration).
  if (typeof input.favorite === "boolean") patch.favorite = input.favorite;

  const content = readPageContent(input.content);
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
  let expected =
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

    if (nextParentId !== page.parent_id) {
      const nextParent = nextParentId ? await loadPage(service, nextParentId, actorId) : null;
      if (
        Object.keys(page.property_values ?? {}).length > 0 ||
        (nextParent?.database_schema && page.database_schema)
      ) {
        return { ok: false, status: 400, errorKey: "pageDatabaseMove" };
      }
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

  // The body and the title are live streams (MIN-688): they change through the
  // operation authority, which expresses this whole value as the smallest
  // replacement and broadcasts it to every open editor. A request whose body
  // and title turn out identical keeps only its other fields for the plain
  // write below.
  if (patch.content !== undefined || patch.title !== undefined) {
    const streamed = await updatePageThroughStreams({
      service, page, actorId, kind, mcpKeyId, alwaysArchive, expected, patch,
    });
    if (streamed !== "unchanged") return streamed;
    delete patch.content;
    delete patch.title;
    delete patch.version;
    expected = null;
    if (Object.keys(patch).length === 0) return { ok: true, page };
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
  // that a reader may want to restore.
  const writesDocument =
    patch.content !== undefined || patch.title !== undefined || "icon" in patch;
  if (writesDocument) Object.assign(patch, writtenBy(actorId, kind, mcpKeyId));

  // The envelope is re-sealed from the STORED page, never the live one: the
  // row's revisions say which steps its projection reflects (MIN-688).
  const stored = await loadStoredPage(service, pageId, actorId);
  if (!stored) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const encoded = await encodePage({ ...stored, ...patch }, { service });
  const protectedWrite = Number(encoded.encryption_version ?? 0) > 0;
  if (protectedWrite) Object.assign(patch, pageContentValues(encoded));

  // The lock is IN the write, not just in the control above:
  // two recordings started at the same millisecond both pass the
  // control (they read the same line) and the second would erase the first. There
  // condition `version = celle qu'on a lue` means that one of the two does not write
  // nothing, and melts again as if it had been refused from the start.
  const write = service.from("pages").update(patch).eq("id", pageId);
  if (expected !== null) write.eq("version", expected);
  if (protectedWrite) write.eq("content_revision",
    (stored as Page & { content_revision: number }).content_revision);

  const { data, error } = await write
    .is("deleted_at", null)
    .select(FULL_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23514" && error.message === "Database entries with values cannot change parent") {
      return { ok: false, status: 409, errorKey: "pageDatabaseMove" };
    }
    console.error("[pages] update failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }
  if (!data) {
    // A metadata write (icon, pin, move) on a protected page re-seals the
    // whole envelope, so live typing in the body moves its CAS token without
    // any conflict of substance: read again and retry a few times.
    if (protectedWrite && expected === null && attempt < 3) {
      return updatePage({ pageId, actorId, kind, mcpKeyId, alwaysArchive, input, attempt: attempt + 1 });
    }
    // No line: either the page has just gone to the trash, or the
    // version moved between reading and writing. We reread to decide —
    // the two answers do not match in the same way.
    if (expected !== null || protectedWrite) {
      const fresh = await loadPage(service, pageId, actorId);
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
      page: await decodePage(data, actorId),
      previous: page,
      actorId,
      kind,
      mcpKeyId,
      event: "page_updated",
    });
  }
  scheduleRoutineEvents();
  // The answer is the live page: typing pending in the journal included.
  return { ok: true, page: await loadPage(service, pageId, actorId) ?? await decodePage(data, actorId) };
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
  let parent: Page | null;
  try {
    parent = await loadPage(service, parentId, actorId);
  } catch {
    // A damaged parent body must not prevent a child from entering the trash.
    return;
  }
  if (!parent) return;

  // Through the operation authority (MIN-688), like every body write: the
  // block disappears (or comes back) LIVE in an editor that has the parent
  // open, and a collaborator's pending typing is rebased around it instead of
  // conflicting. The edit is recomputed on the fresh body at each attempt, so
  // a concurrent write is never overwritten.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let current: Awaited<ReturnType<typeof loadCollabPage>>;
    try {
      current = await loadCollabPage(service, parentId, parent.project_id, actorId);
    } catch {
      return;
    }
    if (!current) return;
    const { doc, changed } = edit((current.page.content as PageDocJSON | null) ?? null);
    if (!changed) return;
    let commit: StreamCommit;
    try {
      commit = await commitPageStreams({
        service,
        live: current,
        // The author of the mirror is that of the GESTURE (trash, restoration),
        // and the gesture is human: the agent has no path to the trash.
        actorId,
        kind: "human",
        edits: [{ field: "body", replace: pageCollaborationServer().canonicalBodyJSON(doc) }],
      });
    } catch (error) {
      console.error("[pages] subpage sync failed:", (error as Error).message);
      return;
    }
    if (commit.status === "accepted") {
      // The body of the PARENT has just changed (one subpage block less or
      // more): its indexed text and links follow, and its previous state is
      // archived like any other — even when no one has the parent open.
      // No ANNOUNCEMENT, and this is deliberate (MIN-278): this mirror is never
      // a gesture in itself — it always accompanies a trash or a restoration,
      // which has already recorded its line. A second one would read
      // “X modified Folder” for each deleted subpage.
      afterStreamCommit({ service, commit, actorId, kind: "human", announce: false });
      return;
    }
    if (commit.status !== "retry" && commit.status !== "behind" && commit.status !== "duplicate") return;
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
  const page = await loadPage(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const refusal = await pageWriteRefusal(actorId, page.project_id, "pageNotFound");
  if (refusal) return refusal;

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
  scheduleRoutineEvents();
  return { ok: true, trashed: descendants.length + 1 };
}

/**
 * Destroys a page that is still blank, the only page removal that bypasses the
 * trash (MIN-270).
 *
 * This exists for a page that was created and abandoned before any content was
 * written. Sending those pages through the trash would fill it with drafts that
 * nobody intended to keep.
 *
 * The database locks the page and rechecks its title, icon, body, and children
 * in the deleting transaction. A concurrent edit that wins the lock therefore
 * turns this into a 409 instead of losing the newer document.
 */
export async function discardPage(
  pageId: string,
  actorId: string
): Promise<{ ok: true } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId, actorId);
  if (!page) return { ok: false, status: 404, errorKey: "pageNotFound" };
  const refusal = await pageWriteRefusal(actorId, page.project_id, "pageNotFound");
  if (refusal) return refusal;

  const { data, error } = await service.rpc("discard_blank_page_guarded", {
    p_page_id: pageId,
  });
  if (error) {
    console.error("[pages] discard failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const result = data as { status?: unknown; parent_id?: unknown } | null;
  if (result?.status === "not_empty") {
    return { ok: false, status: 409, errorKey: "pageNotEmpty" };
  }
  if (result?.status !== "discarded") {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }

  // Only remove the mirror after the guarded delete succeeds. Previously this
  // happened first, so a concurrent edit could preserve the page while still
  // losing its parent block.
  const parentId = typeof result.parent_id === "string" ? result.parent_id : null;
  if (parentId) {
    await syncParentBody(service, parentId, actorId, (doc) => {
      const { doc: next, removed } = removeSubpages(doc, [pageId]);
      return {
        doc: (next ?? { type: "doc", content: [] }) as PageDocJSON,
        changed: removed > 0,
      };
    });
  }

  scheduleRoutineEvents();

  return { ok: true };
}

/**
 * Restores a page and everything that went with it.
 *
 * Ordinary documents whose parent is still trashed return to the project root.
 * Database entries require their parent to be restored first, preserving the
 * schema that gives their stored column values meaning.
 */
export async function restorePage(
  pageId: string,
  actorId: string,
  /** Like the recycle bin above: restore is the reverse gesture, and it opens to the same caller. */
  kind: PageWriteKind = "human"
): Promise<{ ok: true; restored: number } | { ok: false; status: number; errorKey: PageErrorKey }> {
  const service = getServiceClient();
  const page = await loadPage(service, pageId, actorId, { includeTrashed: true });
  if (!page || !page.deleted_at) {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  const refusal = await pageWriteRefusal(actorId, page.project_id, "pageNotFound");
  if (refusal) return refusal;

  const all = await loadProjectPages(service, page.project_id);
  const { data, error } = await service.rpc("restore_page_guarded", {
    p_project_id: page.project_id,
    p_page_id: pageId,
    p_actor_id: actorId,
    p_root_position: positionAtEnd(all.filter((p) => !p.deleted_at && p.parent_id === null)),
  });
  if (error) {
    console.error("[pages] restore failed:", error.message);
    return { ok: false, status: 500, errorKey: "databaseError" };
  }

  const result = data as {
    status?: string;
    restored?: number;
    parent_id?: string | null;
    parent_block_removed?: boolean;
  } | null;
  if (result?.status === "parent_required") {
    return { ok: false, status: 409, errorKey: "pageDatabaseRestoreParent" };
  }
  if (result?.status === "conflict") {
    return { ok: false, status: 409, errorKey: "pageStale" };
  }
  if (result?.status !== "restored" || typeof result.restored !== "number") {
    return { ok: false, status: 404, errorKey: "pageNotFound" };
  }
  if (result.parent_id && result.parent_block_removed) {
    // The block returns to the parent body, at the END of the document (MIN-272).
    // Nothing is duplicated: `appendSubpage` does not set anything if the body
    // already cites the page — the case of a block recreated by hand in the meantime.
    await syncParentBody(service, result.parent_id, actorId, (doc) => {
      const { doc: next, added } = appendSubpage(doc, pageId);
      return { doc: next, changed: added };
    });
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
  scheduleRoutineEvents();
  return { ok: true, restored: result.restored };
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
