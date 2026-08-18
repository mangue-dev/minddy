import "server-only";

import type { JSONContent } from "@tiptap/core";
import {
  createPage,
  getPage,
  listPages,
  searchProjectPages,
  updatePage,
  type PageErrorKey,
} from "@/lib/server/pages";
import {
  bodyFromMarkdownServer,
  markdownToPageServer,
  pageBodyToMarkdownServer,
} from "@/lib/server/pages-projection";
import { editTextPassage } from "@/lib/server/text-edit";
import {
  pageBacklinks,
  type BacklinkQueryable,
  type PageBacklink,
} from "@/lib/server/page-backlinks";
import { getProjectAccess } from "@/lib/server/project-access";
import {
  addPageComment,
  openPageThreadsForAgent,
} from "@/lib/server/page-comments";
import { pageBlockTexts } from "@/lib/pages-mentions";
import { fetchAuthUsersById, toNamed } from "@/lib/server/auth-users";
import { getServiceClient } from "@/lib/supabase-service";
import { displayName } from "@/lib/display-name";
import { SITE_NAME } from "@/lib/site";
import type { Page, PageWriteKind } from "@/lib/pages";

/**
 * THE GESTURES of an agent on the pages (MIN-273), only once.
 *
 * Six originally, seven since MIN-276: search. This is the one that was missing the
 * more — the tree says what exists, not what speaks of what.
 *
 * Three surfaces serve them — the MCP server (`minddy_*_page`), the Numo
 * chat (`*_page`) and the code agent —, and it is precisely why the logic does not live
 * in any of the three: an agent who reads a page in the chat and corrects it
 * from the MCP must see the SAME document, refused in the same way. The
 * adapters therefore only translate the arguments and error codes.
 *
 * Two rules hold the entire module:
 *
 * 1. **the agent only sees markdown.** The JSON ProseMirror does not output never
 * from here: the projection (`lib/server/pages-projection.ts`) translates it in both ways, and that's what makes MIN-269 a strict dependency and
 * not a convenience.
 * 2. **writing goes through the same core as the UI** (`lib/server/pages.ts`):
 * same access guard, same cycle guard, same `version` counter. A
 * parallel path would have its own holes.
 * 3. **all writing here is signed `kind: "agent"`** (MIN-277). It's the
 * only place in the repository that knows: the `actorId` that arrives is that of a
 * human account — the bearer of the MCP key, the Numo user, the
 * owner of the project —, and letting him sign alone would display "modified
 * by Clément" on a page that Clément did not write. The gesture is
 * automated, so it has the name minddy, in the header as in
 * the history.
 *
 * Which is NOT exposed, and it is a decision: the trash. An agent who
 * deletes pages is an unrequited risk, and deleting remains a human gesture — the UI does it very well.
 */

/* ─── Results ─────────────────────────────── ─────────────────────────────── */

export type PageToolCode =
  | "invalid_params"
  | "project_not_found"
  | "page_not_found"
  | "parent_not_found"
  | "page_cycle"
  | "page_stale"
  | "page_not_empty"
  | "page_too_large"
  | "text_not_found"
  | "text_ambiguous"
  | "database_error";

export type PageToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PageToolCode; message: string };

const CODES: Record<PageErrorKey, PageToolCode> = {
  projectNotFound: "project_not_found",
  pageNotFound: "page_not_found",
  pageVersionNotFound: "page_not_found",
  pageParentNotFound: "parent_not_found",
  pageCycle: "page_cycle",
  pageStale: "page_stale",
  pageNotEmpty: "page_not_empty",
  pageTooLarge: "page_too_large",
  pageTooDeep: "page_too_large",
  pageContentRefused: "invalid_params",
  noFieldsToUpdate: "invalid_params",
  databaseError: "database_error",
};

/** Kernel refusals, said in English and in stable codes — like the rest of
 the agent surface (see lib/server/mcp/tool-helpers.ts). */
const MESSAGES: Record<PageErrorKey, string> = {
  projectNotFound: "Project not found or not accessible.",
  pageNotFound: "Page not found in this project.",
  pageVersionNotFound: "That version of the page no longer exists.",
  pageParentNotFound:
    "The parent page does not exist in this project (or is in the trash).",
  pageCycle: "Refused: that move would put the page under one of its own subpages.",
  pageStale:
    "The page was written by someone else since you read it. Read it again and " +
    "re-apply your change on the current text.",
  pageNotEmpty:
    "Refused: that page is no longer empty. Only a page created and left blank " +
    "can be discarded; move a written page to the trash instead.",
  pageTooLarge: "The page body is too large; split it into subpages.",
  pageTooDeep:
    "The page body nests blocks too deeply; flatten it or split it into subpages.",
  pageContentRefused:
    "The page body carries a block minddy does not know, or a link whose " +
    "protocol it refuses (only http, https and mailto are stored).",
  noFieldsToUpdate: "Nothing to update: pass a title, an icon or a markdown body.",
  databaseError: "Database error.",
};

function refuse<T>(errorKey: PageErrorKey): PageToolResult<T> {
  return { ok: false, code: CODES[errorKey], message: MESSAGES[errorKey] };
}

/**
 * The markdown limit accepted in INPUT. The kernel already bounds the stored JSON
 * (1 MB), but it does it AFTER projection: refusing early avoids mounting a
 * editor on a document that will not be written, and returns a message that talks about this
 * that the agent sent rather than its translation.
 */
export const MAX_PAGE_MARKDOWN = 400_000;

/* ─── Ce que l'agent lit ───────────────────────────────────────────────────── */

/** A page in the tree, without its body. */
export interface PageTreeEntry {
  page_id: string;
  title: string;
  icon: string | null;
  /** `null` = page racine. L'arbre se reconstruit chez l'appelant. */
  parent_page_id: string | null;
  updated_at: string;
}

/** A page read in its entirety: its header, its body in markdown, its children. */
export interface PageRead extends PageTreeEntry {
  /**
 * WHO wrote last (MIN-277), and what nature was the gesture.
 *
 * An agent who rereads a page must know if a human has passed through it since his
 * last turn: it's the difference between "I'm resuming my text" and "I
 * I'm about to crush someone's." The name follows the identity rule —
 * “minddy” when the last write came from an agent, regardless of the
 * account that allowed it.
 */
  last_edited_by: string;
  last_edited_kind: PageWriteKind;
  /** The body ALONE, in markdown (the title and icon are above). */
  markdown: string;
  /** The body writing counter — to be ironed to write without overwriting. */
  version: number;
  /** DIRECT subpages, to go down the tree without a second call. */
  subpages: Array<{ page_id: string; title: string; icon: string | null }>;
  /**
 * WHICH relies on this page (MIN-279) — tickets, objectives and other pages,
 * by the resource as well as by the mention.
 *
 * This is what an agent who opens a spec misses the most: without that, "what
 * does we break by changing this decision? » is answered by searching the entire
 * project, or is not answered. The link went one way.
 */
  backlinks: PageBacklink[];
  /**
 * The threads of the page (MIN-282).
 *
 * This is often where the real constraint is: a spec says what has been
 * decided, its comments say what is contested and has not yet been
 * rewritten. An agent who rewrites a page without having read them decides without knowing a debate in progress.
 */
  threads: PageThreadForAgent[];
}

/** A thread, as an agent reads it: what he is talking about, and what was said there. */
export interface PageThreadForAgent {
  /** The address of the thread, to return to `parent_comment_id` to respond DEDANS
 rather than opening a second one next to it. */
  thread_id: string;
  /** The commented extract, frozen at the time of the comment. Null = on the page. */
  quote: string | null;
  /** The anchor, to return to `minddy_add_page_comment` to respond to the same
 location. Null = a comment on the entire page. */
  block_id: string | null;
  messages: { author: string; body: string; at: string }[];
}

/** The writing, as an agent rereads it: enough to confirm, not the document. */
export interface PageWritten extends PageTreeEntry {
  version: number;
  /** Body length in markdown, after writing. */
  markdown_length: number;
}

function entry(page: {
  id: string;
  title: string;
  icon: string | null;
  parent_id: string | null;
  updated_at: string;
}): PageTreeEntry {
  return {
    page_id: page.id,
    title: page.title,
    icon: page.icon,
    parent_page_id: page.parent_id ?? null,
    updated_at: page.updated_at,
  };
}

/* ─── Lecture ──────────────────────────────────────────────────────────────── */

/** The project's page tree, flat, without bodies. */
export async function listPagesForAgent({
  projectId,
  actorId,
}: {
  projectId: string;
  actorId: string;
}): Promise<PageToolResult<{ pages: PageTreeEntry[] }>> {
  const result = await listPages(projectId, actorId);
  if (!result.ok) return refuse(result.errorKey);
  return { ok: true, data: { pages: result.pages.map(entry) } };
}

/** A markdown page, header and direct subpages included. */
export async function readPageForAgent({
  pageId,
  projectId,
  actorId,
  withBacklinks = true,
}: {
  pageId: string;
  /** The expected project: a page from ANOTHER accessible project does not respond here. */
  projectId?: string;
  actorId: string;
  /** Cut off by INTERNAL READS (adding a block, rewriting a passage): they only want the markdown and the version, and paying for trackback requests on each edit would be paying for a list that no one reads. */
  withBacklinks?: boolean;
}): Promise<PageToolResult<PageRead>> {
  const result = await getPage(pageId, actorId);
  if (!result.ok) return refuse(result.errorKey);
  const page = result.page;
  if (projectId && page.project_id !== projectId) return refuse("pageNotFound");

  const markdown = await pageBodyToMarkdownServer(
    (page.content as JSONContent | null) ?? null
  );

  // The children come from the project LIST: one more request, but it
  // is already indexed and without a body, and it saves the agent from a second call
  // just to know if the page has descendants.
  const siblings = await listPages(page.project_id, actorId);
  const subpages = siblings.ok
    ? siblings.pages
        .filter((p) => p.parent_id === page.id)
        .map((p) => ({ page_id: p.id, title: p.title, icon: p.icon }))
    : [];

  // The KEY to the project, so ticket trackbacks read “MIN-42”
  // and not in UUID — it is in this form that the agent will pass them on to others
  // tools. SERVICE client for the reading itself: the access guard comes
  // to be made by `getPage`, and RLS does not apply here.
  let backlinks: PageBacklink[] = [];
  let threads: PageThreadForAgent[] = [];
  if (withBacklinks) {
    const projectAccess = await getProjectAccess(actorId, page.project_id);
    backlinks = await pageBacklinks(
      getServiceClient() as unknown as BacklinkQueryable,
      {
        pageId: page.id,
        projectKey: (projectAccess?.project.key as string | undefined) ?? "",
      }
    );
    // The WIRES (MIN-282), under the same care as the trackbacks: both
    // answer “what does this text commit to?” ”, and internal readings
    // (add a block, correct a passage) don't want any.
    threads = await readThreads(page.id);
  }

  return {
    ok: true,
    data: {
      ...entry(page),
      last_edited_by: await lastWriterName(page),
      last_edited_kind: page.updated_kind ?? "human",
      markdown,
      version: page.version,
      subpages,
      backlinks,
      threads,
    },
  };
}

/**
 * The threads of a page, authors NAMED.
 *
 * The names come out of the accounts, like everywhere else — never the raw email
 * (lib/display-name.ts) —, and an agent's writing is called "minddy": the rule
 * of identity is valid for what an agent reads as well as for what a human reads.
 */
async function readThreads(pageId: string): Promise<PageThreadForAgent[]> {
  const service = getServiceClient();
  const raw = await openPageThreadsForAgent(service, pageId, (id) => id ?? "");
  const ids = [
    ...new Set(
      raw.flatMap((thread) => thread.messages.map((m) => m.author)).filter(Boolean)
    ),
  ];
  const users = ids.length ? await fetchAuthUsersById(service, ids) : new Map();
  const name = (id: string) => {
    const user = users.get(id);
    return user ? displayName(toNamed(user), "") || SITE_NAME : SITE_NAME;
  };
  return raw.map((thread) => ({
    ...thread,
    messages: thread.messages.map((m) => ({ ...m, author: name(m.author) })),
  }));
}

/** Refusals from the comments core, translated into the vocabulary of page tools
 (stable codes, messages in English). */
const COMMENT_REFUSALS: Record<
  "commentEmpty" | "pageNotFound" | "commentNotFound" | "databaseError",
  { ok: false; code: PageToolCode; message: string }
> = {
  commentEmpty: {
    ok: false,
    code: "invalid_params",
    message: "A comment cannot be empty.",
  },
  pageNotFound: {
    ok: false,
    code: "page_not_found",
    message: MESSAGES.pageNotFound,
  },
  commentNotFound: {
    ok: false,
    code: "invalid_params",
    message:
      "That comment is not on this page — reply to a thread you read with " +
      "minddy_get_page.",
  },
  databaseError: {
    ok: false,
    code: "database_error",
    message: MESSAGES.databaseError,
  },
};

/**
 * COMMENT on a page, or one of its blocks, as an agent (MIN-282).
 *
 * The only gesture of writing pages which does not touch the document: respond to
 * an objection, raise one, say why we did not do what was done
 *asked. Without it, an agent read questions without being able to answer them.
 *
 * The anchor is the `block_id` of a thread already read (`threads`): an agent does not
 * create an anchor, it takes one — the block ids are not in the
 * markdown it reads, and an invented anchor would make a detached thread at the second
 * where it is written.
 */
export async function addPageCommentForAgent({
  pageId,
  projectId,
  actorId,
  body,
  blockId,
  parentCommentId,
  viaAssistant = false,
  mcpKeyId = null,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  body: string;
  blockId?: string | null;
  parentCommentId?: string | null;
  viaAssistant?: boolean;
  mcpKeyId?: string | null;
}): Promise<PageToolResult<{ page_id: string; comment_id: string }>> {
  // The page first: access control and custody of “this project” are the
  // same as for a reading, and they must be — a comment on a
  // page invisible en apprendrait l'existence.
  const found = await getPage(pageId, actorId);
  if (!found.ok) return refuse(found.errorKey);
  if (projectId && found.page.project_id !== projectId) return refuse("pageNotFound");

  // The extract: we RE-READ it in the document rather than asking it to
  // the agent. A dictated extract would be a quote that he could have reformulated,
  // displayed to the human as the text of its page.
  const quote = blockId
    ? (pageBlockTexts((found.page.content as JSONContent | null) ?? null).find(
        (block) => block.blockId === blockId
      )?.text ?? null)
    : null;

  const result = await addPageComment({
    pageId,
    actorId,
    body,
    blockId: blockId ?? null,
    quote,
    parentId: parentCommentId ?? null,
    viaAssistant,
    mcpKeyId,
  });
  if (!result.ok) return COMMENT_REFUSALS[result.errorKey];
  return {
    ok: true,
    data: { page_id: pageId, comment_id: result.comment.id as string },
  };
}

/**
 * The name of the last author, as required by minddy's identity rule.
 *
 * An agent write carries the id of the account that authorized it; we don't read it
 * — returning it would make it appear as his, in the eyes of the next agent, a
 * text that no one wrote.
 */
async function lastWriterName(page: Page): Promise<string> {
  if (page.updated_kind === "agent") return SITE_NAME;
  const id = page.updated_by ?? page.created_by;
  if (!id) return "";
  const users = await fetchAuthUsersById(getServiceClient(), [id]);
  const user = users.get(id);
  return user ? displayName(toNamed(user), "") : "";
}

/** A page found: enough to decide which one to open, without opening it. */
export interface PageSearchResult {
  page_id: string;
  title: string;
  icon: string | null;
  /** The path of ancestors, from the highest to the direct parent — “Specs › API”.
 Two “Notes” pages in a wiki, it is the path that distinguishes them. */
  path: string[];
  /** The passage of the body that responded. Empty when only the title responded. */
  excerpt: string;
  updated_at: string;
}

/**
 * Search the wiki, title AND content (MIN-276).
 *
 * This is the tool that an agent lacked the most: without it, "where was it written
 * the decision on X" can be answered by reading the entire wiki, or not answered not.
 * The tree (`list_pages`) says what exists, not what speaks of what.
 *
 * The ancestor path is reconstructed here, from the flat list that the
 * kernel already renders — one more request, without a body, versus a round trip by
 * agent side page.
 */
export async function searchPagesForAgent({
  projectId,
  actorId,
  query,
  limit,
}: {
  projectId: string;
  actorId: string;
  query: string;
  limit?: number;
}): Promise<PageToolResult<{ query: string; pages: PageSearchResult[] }>> {
  if (!query.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message: "query must carry the words to look for.",
    };
  }

  const found = await searchProjectPages({ projectId, actorId, query, limit });
  if (!found.ok) return refuse(found.errorKey);
  if (found.hits.length === 0) {
    return { ok: true, data: { query, pages: [] } };
  }

  const all = await listPages(projectId, actorId);
  const byId = new Map(
    (all.ok ? all.pages : []).map((page) => [page.id, page] as const)
  );
  const pathOf = (parentId: string | null): string[] => {
    const path: string[] = [];
    let cursor = parentId;
    // A safeguard is better than trust: the depth is unlimited,
    // and a loop in the data would run this loop endlessly.
    while (cursor && path.length < 20) {
      const parent = byId.get(cursor);
      if (!parent) break;
      path.unshift(parent.title || "(untitled)");
      cursor = parent.parent_id ?? null;
    }
    return path;
  };

  return {
    ok: true,
    data: {
      query,
      pages: found.hits.map((hit) => ({
        page_id: hit.id,
        title: hit.title,
        icon: hit.icon,
        path: pathOf(hit.parent_id),
        excerpt: hit.excerpt,
        updated_at: hit.updated_at,
      })),
    },
  };
}

/* ─── Writing ─────────────────────────────── ──────────────────────────────── */

/**
 * The body, read from the agent's markdown.
 *
 * `consumeHead` decides the fate of a `# ` at the head: CONSUMED as title (and its
 * emoji as icon), or kept as content. This is the delicate point of all
 * this module, and it is only seen on the second round trip.
 *
 * At CREATION without title, consuming is the service provided: Numo writes an entire page
 * in one go, header included, as does `markdownToPage`
 * (MIN-269). The `title` field is required on the tool side (a small model does not fill in
 * an optional field), so "I don't have a separate title" is written as
 * necessarily `""` — hence the empty title being treated as absent.
 *
 * UPDATE, never. A level 1 title block is a perfectly legitimate
 * page block: `minddy_get_page` therefore renders bodies that BEGIN
 * with `# `, and returning them as is to `minddy_update_page` would bring up
 * this first line in the page title — a document which loses its
 * first title each time it is written, without anything saying so. On a page that
 * exists, a body is a body.
 */
async function readBody(
  markdown: string,
  { consumeHead }: { consumeHead: boolean }
): Promise<
  | { ok: true; content: JSONContent | null; title?: string; icon?: string | null }
  | { ok: false; code: PageToolCode; message: string }
> {
  if (markdown.length > MAX_PAGE_MARKDOWN) {
    return {
      ok: false,
      code: "page_too_large",
      message:
        `The markdown body is capped at ${MAX_PAGE_MARKDOWN} characters (got ` +
        `${markdown.length}); split the page into subpages.`,
    };
  }
  if (consumeHead) {
    const projected = await markdownToPageServer(markdown);
    if (projected.title || projected.icon) {
      return {
        ok: true,
        content: projected.content,
        title: projected.title,
        icon: projected.icon,
      };
    }
    return { ok: true, content: projected.content };
  }
  return { ok: true, content: await bodyFromMarkdownServer(markdown) };
}

export async function createPageForAgent({
  projectId,
  actorId,
  title,
  icon,
  markdown,
  parentPageId,
  mcpKeyId,
}: {
  projectId: string;
  actorId: string;
  title?: string;
  icon?: string | null;
  markdown?: string;
  parentPageId?: string | null;
  /** The MCP key behind the call, when the surface has one (MIN-278): it is
 which NAMES the agent in the activity of the page and in the quotes
 that he places there. Absent on chat and code agent, which are Numo. */
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  const input: Record<string, unknown> = {
    parent_id: parentPageId ?? null,
  };
  let body = "";

  if (markdown !== undefined && markdown.trim()) {
    const read = await readBody(markdown, { consumeHead: !title?.trim() });
    if (!read.ok) return read;
    input.content = read.content;
    if (read.title !== undefined) input.title = read.title;
    if (read.icon !== undefined) input.icon = read.icon;
    body = markdown;
  }
  if (title?.trim()) input.title = title;
  if (icon !== undefined) input.icon = icon;
  if (input.title === undefined) input.title = "";

  const result = await createPage({
    projectId,
    actorId,
    kind: "agent",
    mcpKeyId,
    input,
  });
  if (!result.ok) return refuse(result.errorKey);
  return {
    ok: true,
    data: {
      ...entry(result.page),
      version: result.page.version,
      markdown_length: body.trim().length,
    },
  };
}

/**
 * Replace body, title, icon. Absent fields don't move.
 *
 * `version` is the concurrent write guardrail (MIN-271): passed, it
 * causes the write to fail if someone — a human in the editor, another
 * agent — has written the body in the meantime. This is the same lock as that of
 * the editor, and that's why an agent replacing a body should always pass it.
 */
export async function updatePageForAgent({
  pageId,
  projectId,
  actorId,
  title,
  icon,
  markdown,
  version,
  parentPageId,
  mcpKeyId,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  title?: string;
  icon?: string | null;
  markdown?: string;
  version?: number;
  parentPageId?: string | null;
  /** Cf. `createPageForAgent`. */
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  if (
    !title?.trim() &&
    icon === undefined &&
    markdown === undefined &&
    parentPageId === undefined
  ) {
    return refuse("noFieldsToUpdate");
  }

  // Project guard cannot live in core (it works by id of
  // page): we reread the page to place it, and this reading also serves as a 404
  // frank before writing.
  if (projectId) {
    const current = await getPage(pageId, actorId);
    if (!current.ok) return refuse(current.errorKey);
    if (current.page.project_id !== projectId) return refuse("pageNotFound");
  }

  const input: Record<string, unknown> = {};
  let body = "";
  if (markdown !== undefined) {
    // No header consumption on a page that exists: cf. `readBody`.
    const read = await readBody(markdown, { consumeHead: false });
    if (!read.ok) return read;
    input.content = read.content ?? { type: "doc", content: [] };
    if (version !== undefined) input.version = version;
    body = markdown;
  }
  if (title?.trim()) input.title = title;
  if (icon !== undefined) input.icon = icon;
  if (parentPageId !== undefined) input.parent_id = parentPageId;

  const result = await updatePage({
    pageId,
    actorId,
    kind: "agent",
    mcpKeyId,
    input,
  });
  if (!result.ok) return refuse(result.errorKey);
  return {
    ok: true,
    data: {
      ...entry(result.page),
      version: result.page.version,
      markdown_length: body.trim().length,
    },
  };
}

/**
 * Add a block AT THE END of the page, without returning the document.
 *
 * The page is reread, the block pasted at the end of the markdown, and the writing starts again
 * with the `version` which has just been read: if someone has written in
 * interval, addition is disallowed rather than overwriting. It's the same pattern
 * as `minddy_append_to_plan`, except for the merge — a plan is a text field,
 * a page is a versioned document.
 */
export async function appendToPageForAgent({
  pageId,
  projectId,
  actorId,
  markdown,
  mcpKeyId,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  markdown: string;
  /** Cf. `createPageForAgent`. */
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  if (!markdown.trim()) {
    return {
      ok: false,
      code: "invalid_params",
      message: "markdown must carry the block to add.",
    };
  }

  const current = await readPageForAgent({
    pageId,
    projectId,
    actorId,
    withBacklinks: false,
  });
  if (!current.ok) return current;

  const body = current.data.markdown.trim();
  const next = body ? `${body}\n\n${markdown.trim()}` : markdown.trim();

  return writeBody({
    pageId,
    actorId,
    markdown: next,
    version: current.data.version,
    mcpKeyId,
  });
}

/** Rewrite ONE passage of the body: `old_string` → `new_string`. */
export async function editPageTextForAgent({
  pageId,
  projectId,
  actorId,
  oldString,
  newString,
  replaceAll = false,
  tools,
  mcpKeyId,
}: {
  pageId: string;
  projectId?: string;
  actorId: string;
  oldString: string;
  newString: string;
  replaceAll?: boolean;
  /** The names that the calling surface bears, so that refusals refer to
 tools that exist on it (see IssueTextTools). */
  tools: { read: string; replaceWhole: string };
  /** Cf. `createPageForAgent`. */
  mcpKeyId?: string | null;
}): Promise<
  PageToolResult<PageWritten & { diff: string; additions: number; deletions: number }>
> {
  const current = await readPageForAgent({
    pageId,
    projectId,
    actorId,
    withBacklinks: false,
  });
  if (!current.ok) return current;

  const edit = editTextPassage({
    field: "body",
    subject: "page",
    current: current.data.markdown,
    oldString,
    newString,
    replaceAll,
    read: tools.read,
    otherWay: `Use ${tools.replaceWhole} to write the whole body.`,
  });
  if (!edit.ok) return { ok: false, code: edit.code, message: edit.message };

  const written = await writeBody({
    pageId,
    actorId,
    markdown: edit.content,
    version: current.data.version,
    mcpKeyId,
  });
  if (!written.ok) return written;
  return {
    ok: true,
    data: {
      ...written.data,
      diff: edit.diff,
      additions: edit.additions,
      deletions: edit.deletions,
    },
  };
}

/** The body alone, written on a read version. The title and the icon do not move
: a `# ` at the top of an addition is CONTENT, not a renaming. */
async function writeBody({
  pageId,
  actorId,
  markdown,
  version,
  mcpKeyId,
}: {
  pageId: string;
  actorId: string;
  markdown: string;
  version: number;
  mcpKeyId?: string | null;
}): Promise<PageToolResult<PageWritten>> {
  if (markdown.length > MAX_PAGE_MARKDOWN) {
    return {
      ok: false,
      code: "page_too_large",
      message:
        `The page body would reach ${markdown.length} characters, over the ` +
        `${MAX_PAGE_MARKDOWN} cap; split it into subpages.`,
    };
  }
  const content = await bodyFromMarkdownServer(markdown);
  const result = await updatePage({
    pageId,
    actorId,
    kind: "agent",
    mcpKeyId,
    input: { content, version },
  });
  if (!result.ok) return refuse(result.errorKey);
  return {
    ok: true,
    data: {
      ...entry(result.page),
      version: result.page.version,
      markdown_length: markdown.trim().length,
    },
  };
}
