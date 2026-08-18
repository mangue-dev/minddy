"use client";

import type { Page, PageVersion } from "./pages";
import type { IssueEvent, PageBacklink, PageShare } from "./types";
import type { PageComment } from "./page-comments";
import { trackEvent } from "./analytics";
import { lengthBucket } from "./analytics-sanitize";

/**
 * The HTTP client for pages (MIN-266) — enough to read and write a page from
 * the browser, without knowing anything about the shape of the routes.
 *
 * The LIST does not carry the body of the documents (the server does not send it):
 * it is what feeds the sidebar tree, once for the entire project.
 * The body arrives page by page, upon opening.
 */

/** A page without its body — what the list renders. */
export type PageSummary = Omit<Page, "content">;

/**
 * An error that keeps its CODE.
 *
 * The cycle refusal (409) is indistinguishable from another failure by its
 * message — it is translated on the server side, therefore unreadable for code. The tree has
 * yet needs to make the difference: a 409 catches up (we put the page
 * back where it was and we say so), a network failure does not.
 */
export class PageApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "PageApiError";
  }
}

/**
 * The writing refused because the page moved under our feet (MIN-271).
 *
 * It carries the page from the SERVER, body included: this is what allows to
 * to merge by block immediately (`lib/pages-merge.ts`) instead to go
 * request the document again — one more round trip, exactly at the moment when
 * two people are writing at the same time.
 */
export class PageConflictError extends PageApiError {
  constructor(
    message: string,
    readonly page: Page
  ) {
    super(message, 409);
    this.name = "PageConflictError";
  }
}

/** The move refused because it would close a loop (lib/server/pages.ts).
 A 409 of VERSION carries its page: it is not the same refusal, and the tree should not say "loop" to someone who has simply been overtaken. */
export function isPageCycleError(error: unknown): boolean {
  return (
    error instanceof PageApiError &&
    error.status === 409 &&
    !(error instanceof PageConflictError)
  );
}

async function ok(response: Response, fallback: string): Promise<void> {
  if (response.ok) return;
  const data = (await response.json().catch(() => null)) as
    | { error?: string; conflict?: boolean; page?: Page }
    | null;
  const message = data?.error || fallback;
  if (response.status === 409 && data?.conflict && data.page) {
    throw new PageConflictError(message, data.page);
  }
  throw new PageApiError(message, response.status);
}

async function json<T>(response: Response, fallback: string): Promise<T> {
  await ok(response, fallback);
  return (await response.json()) as T;
}

/** All living pages of the project, flat (`buildPageTree` makes the tree). */
export async function fetchPagesApi(projectId: string): Promise<PageSummary[]> {
  return json(
    await fetch(`/api/projects/${projectId}/pages`),
    "Request failed"
  );
}

/** A page with his body. */
export async function fetchPageApi(
  projectId: string,
  pageId: string
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}`),
    "Request failed"
  );
}

export interface CreatePageInput {
  title?: string;
  icon?: string | null;
  /** Sous-page : l'id du parent. Absent = page racine. */
  parent_id?: string | null;
  content?: unknown;
  /**
 * The body in MARKDOWN, projected in JSON by the server (`content` wins
 * if both are there). This is where the pasted brief from the
 * project wizard goes: projecting to the server avoids pulling the page schema into the
 * bundle of the caller.
 */
  markdown?: string;
}

export async function createPageApi(
  projectId: string,
  input: CreatePageInput = {}
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Create failed"
  );
}

export interface UpdatePageInput {
  title?: string;
  icon?: string | null;
  /**
 * Move. The server REFUSES (409) to put a page under one of its own descendants: the depth is unlimited, a loop would send the tree into infinite recursion.
 */
  parent_id?: string | null;
  /** Fractional index calculated by `positionBetween` (lib/pages.ts). */
  position?: string;
  content?: unknown;
  /** Pinned to the top of the secondary bar — shared by the project. */
  favorite?: boolean;
  /**
 * The version this body is based on (MIN-271). Sent WITH a
 * `content`, it makes it a conditional write: the server responds
 * 409 (`PageConflictError`) rather than overwriting what someone else has written
 * in the meantime. Without it, the last one to save wins, silently.
 */
  version?: number;
}

export async function updatePageApi(
  projectId: string,
  pageId: string,
  input: UpdatePageInput
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Update failed"
  );
}

/**
 * The writing of the LAST CHANCE, when the tab leaves.
 *
 * An ordinary `fetch` launched from `pagehide` is canceled with the document: the
 * second of typing which had not yet left was lost at each
 * refresh, and the page reopened to the previous version. `keepalive` tells
 * the browser to complete the request even once the page is destroyed.
 *
 * Neither promise nor error to recover: there is no one left to read them.
 * `sendBeacon` is not suitable — it does not know how to make a PATCH.
 */
export function updatePageOnUnload(
  projectId: string,
  pageId: string,
  input: UpdatePageInput
): void {
  void fetch(`/api/projects/${projectId}/pages/${pageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Copy — also recursive: the page AND its subpages, internal links
 * rewritten to the copy. Returns the ROOT of the copy.
 */
export async function duplicatePageApi(
  projectId: string,
  pageId: string
): Promise<Page> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/duplicate`, {
      method: "POST",
    }),
    "Duplicate failed"
  );
}

/** Trash — recursive: the page AND its subpages. Nothing is destroyed. */
export async function trashPageApi(
  projectId: string,
  pageId: string
): Promise<{ trashed: number }> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}`, {
      method: "DELETE",
    }),
    "Delete failed"
  );
}

/**
 * DESTROYS a page that remains empty - no trash, nothing to restore.
 *
 * The only caller is the start of a page that we have just created and where we have
 * nothing written (lib/pages-draft.ts). The server rechecks that it is indeed empty
 * and without subpage, and responds 409 otherwise: this path cannot make
 * disappear from the content.
 */
export async function discardPageApi(
  projectId: string,
  pageId: string
): Promise<void> {
  await ok(
    await fetch(`/api/projects/${projectId}/pages/${pageId}?discard=1`, {
      method: "DELETE",
    }),
    "Delete failed"
  );
}

/**
 * The same destruction, when the tab leaves — same reason as
 * `updatePageOnUnload`: an ordinary `fetch` launched from `pagehide` dies
 * with the document.
 */
export function discardPageOnUnload(projectId: string, pageId: string): void {
  void fetch(`/api/projects/${projectId}/pages/${pageId}?discard=1`, {
    method: "DELETE",
    keepalive: true,
  }).catch(() => {});
}

/** Immediate rollback (an “Undo” toast). */
export async function restorePageApi(
  projectId: string,
  pageId: string
): Promise<{ restored: number }> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/restore`, {
      method: "POST",
    }),
    "Restore failed"
  );
}

/* ─── L'historique (MIN-277) ───────────────────────────────────────────────── */

/** The previous states of a page, from newest to oldest, without body. */
export async function fetchPageVersionsApi(
  projectId: string,
  pageId: string
): Promise<PageVersion[]> {
  const data = await json<{ versions: PageVersion[] }>(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/versions`),
    "Request failed"
  );
  return data.versions;
}

/** ONE version, including body — what the read-only preview shows. */
export async function fetchPageVersionApi(
  projectId: string,
  pageId: string,
  versionId: string
): Promise<PageVersion> {
  return json(
    await fetch(
      `/api/projects/${projectId}/pages/${pageId}/versions/${versionId}`
    ),
    "Request failed"
  );
}

/**
 * Returns a version. Returns the written page, body included.
 *
 * A writing like any other: it increments the `version` of the page — therefore
 * the open editor must reload on it rather than continuing on its own,
 * which is now expired.
 */
export async function restorePageVersionApi(
  projectId: string,
  pageId: string,
  versionId: string
): Promise<Page> {
  return json(
    await fetch(
      `/api/projects/${projectId}/pages/${pageId}/versions/${versionId}/restore`,
      { method: "POST" }
    ),
    "Restore failed"
  );
}

/* ─── Activity (MIN-278) ───────────────────────── ────────────────────────── */

/**
 * The log of a page — created, modified, trashed, restored —
 * in chronological order, with its actors already resolved by the server.
 *
 * The rows are `IssueEvent` and this is not a misnomer: the table is
 * the same (`issue_events`, polymorphic from the objectives), and this is what
 * allows them to be rendered with the existing activity component rather than a second one, to keep in phase with the first.
 */
/** Who cites this page (MIN-279) — resources AND mentions, faded. */
export async function fetchPageBacklinksApi(
  projectId: string,
  pageId: string
): Promise<PageBacklink[]> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/backlinks`),
    "Request failed"
  );
}

export async function fetchPageEventsApi(
  projectId: string,
  pageId: string
): Promise<IssueEvent[]> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/events`),
    "Request failed"
  );
}

/* ── One-page COMMENTS (MIN-282) ──────────────────────────────────__keep in a request: what is read where — next to its block, or in
 the activity of the page — is a display decision (lib/page-comments.ts),
 not one more request. */

export async function fetchPageCommentsApi(
  projectId: string,
  pageId: string
): Promise<PageComment[]> {
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/comments`),
    "Request failed"
  );
}

export async function addPageCommentApi(
  projectId: string,
  pageId: string,
  input: {
    body: string;
    /** The anchor: the commented block. Absent = a comment on the page. */
    blockId?: string | null;
    /** The selected extract, frozen with the comment. */
    quote?: string | null;
    parentId?: string | null;
    mentionedUserIds?: string[];
  }
): Promise<PageComment> {
  // Only metadata: the length in slices, never the text — the same
  // rule that the other three threads (lib/comments-api.ts).
  trackEvent("comment_added", {
    target: "page",
    length_bucket: lengthBucket(input.body),
    is_reply: !!input.parentId,
    mention_count: input.mentionedUserIds?.length ?? 0,
    anchored: !!input.blockId,
  });
  return json(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: input.body,
        block_id: input.blockId ?? null,
        quote: input.quote ?? null,
        parent_id: input.parentId ?? null,
        mentioned_user_ids: input.mentionedUserIds ?? [],
      }),
    }),
    "Request failed"
  );
}

export async function updatePageCommentApi(
  projectId: string,
  pageId: string,
  commentId: string,
  body: string
): Promise<PageComment> {
  return json(
    await fetch(
      `/api/projects/${projectId}/pages/${pageId}/comments/${commentId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      }
    ),
    "Request failed"
  );
}

export async function deletePageCommentApi(
  projectId: string,
  pageId: string,
  commentId: string
): Promise<void> {
  await ok(
    await fetch(
      `/api/projects/${projectId}/pages/${pageId}/comments/${commentId}`,
      { method: "DELETE" }
    ),
    "Request failed"
  );
  trackEvent("comment_deleted", { target: "page" });
}

/* ── Publish and export (MIN-283) ──────────────────── ───────────────────── */

/** The publishing state of a page (`null` = private). */
export async function fetchPageShareApi(
  projectId: string,
  pageId: string
): Promise<PageShare | null> {
  const data = await json<{ share: PageShare | null }>(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/share`),
    "Request failed"
  );
  return data.share;
}

export async function updatePageShareApi(
  projectId: string,
  pageId: string,
  input: {
    level: "password" | "public";
    password?: string;
    include_children?: boolean;
  }
): Promise<PageShare> {
  trackEvent("page_published", {
    has_password: input.level === "password",
    with_children: input.include_children === true,
  });
  const data = await json<{ share: PageShare }>(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/share`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
    "Request failed"
  );
  return data.share;
}

export async function deletePageShareApi(
  projectId: string,
  pageId: string
): Promise<void> {
  trackEvent("page_unpublished", {});
  await json<{ ok: boolean }>(
    await fetch(`/api/projects/${projectId}/pages/${pageId}/share`, {
      method: "DELETE",
    }),
    "Request failed"
  );
}

/**
 * Download a page in markdown — alone (`.md`) or with its branch (`.zip`).
 *
 * The file goes through a blob and a programmed anchor rather than through a
 * navigation: the route requires the session, and a `window.open` on a
 * `Content-Disposition: attachment` leaves an empty tab behind on
 * multiple browsers. The NAME comes from the server (`Content-Disposition`), only
 * place that knows the file name rule.
 */
export async function downloadPageExportApi(
  projectId: string,
  pageId: string,
  { branch = false }: { branch?: boolean } = {}
): Promise<void> {
  trackEvent("page_exported", { format: branch ? "zip" : "md" });
  const response = await fetch(
    `/api/projects/${projectId}/pages/${pageId}/export${branch ? "?scope=branch" : ""}`
  );
  await ok(response, "Request failed");
  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = encoded ? decodeURIComponent(encoded) : `page.${branch ? "zip" : "md"}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on next tick: Safari reads the URL AFTER the click.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
