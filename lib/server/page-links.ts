import "server-only";

import { contentMentionScanner, type MentionPage } from "@/lib/mention-scan";
import { pageBlockTexts } from "@/lib/pages-mentions";
import { afterOrNow } from "@/lib/server/after-safe";
import type { getServiceClient } from "@/lib/supabase-service";

/**
 * THAT cites a page (MIN-279) — the half that no query could return.
 *
 * A ticket that cites a page by a RESOURCE already reads: `attachments`
 * carries a real foreign key since MIN-275, and its index was waiting this
 * ticket this one. A MENTION, no — and it is the contract of minddy's mentions which
 * wants it: what is stored is TEXT, "@Title", re-scanned at the
 * rereading, never a persisted node. There is therefore nothing to query, and the
 * only way to obtain a table of links is to DERIVE it when writing.
 *
 * This is the gesture of `pages.search_text` (MIN-276), to the exact word, and it carries the
 * same two rules :
 *
 * 1. **the client never writes it.** The lines are calculated here, from the
 * text which has just been written and the list of project pages such as
 * as it is IN BASE. A client who provides his links is lying about the day when he
 * is old, or when he cites a page that he does not have the right to see.
 * 2. **the source is rewritten IN ENTIRETY.** `delete` of its lines, then
 * `insert` of those that the text still carries. An incremental diff leaves
 * ghost links whenever a write fails halfway through — and a ghost trackback
 * is never seen from the source that created it, only from
 * the cited page, where no one can correct it.
 *
 * And like the search column, it goes out of the critical path: `afterOrNow`.
 * The saving of an editor is already triggered at the second; adding two
 * queries for a table that no one is expecting would make each keystroke longer.
 */

type Service = ReturnType<typeof getServiceClient>;

/** Which can cite a page. The third is what makes a network. */
export type PageLinkSourceKind = "issue" | "objective" | "page";

export interface PageLinkSource {
  kind: PageLinkSourceKind;
  /** The id of the citing ticket, issue, or page. */
  id: string;
  /** The SOURCE project — and therefore that of the pages it can cite. */
  projectId: string;
}

/**
 * CITABLE pages of a project, as requested by the scanner.
 *
 * Trash bins included, and this is intentional: a trashed page is only
 * a `deleted_at` (MIN-266), the texts which cite it cite it always, and
 * the trackback must be there when it returns. Reading it will make it
 * inert - as the resource pill already does.
 *
 * UNTITLED pages are discarded, and not for aesthetic reasons: an empty label
 * enters the scanner's alternation like a branch that matches the string
 * empty, and each “@” in the text would then become a quote from the new page
 * that we have just opened. A page without a title cannot be cited anyway.
 */
async function citablePages(
  service: Service,
  projectId: string
): Promise<MentionPage[]> {
  const { data, error } = await service
    .from("pages")
    .select("id, project_id, title, icon")
    .eq("project_id", projectId);
  if (error) {
    console.error("[page-links] pages read failed:", error.message);
    return [];
  }
  return ((data ?? []) as MentionPage[]).filter((page) => !!page.title?.trim());
}

/**
 * The pages that a TEXT cites — the rule, isolated from the base to be
 * verifiable as it is.
 *
 * The scanner is that of everything else (lib/mention-scan.ts): this is what
 * guarantees that the pill displayed in the description and the line written here
 * indicates the same page. A mention typed by hand, without going through the
 * selector, therefore counts as much as another.
 */
export function citedPageIds(text: string, pages: MentionPage[]): string[] {
  if (!text.includes("@") || pages.length === 0) return [];
  const scan = contentMentionScanner({ pages });
  const found = new Set<string>();
  for (const segment of scan(text)) {
    if (segment.mention?.type === "page") found.add(segment.mention.page.id);
  }
  return [...found];
}

/**
 * The TEXT of a source, regardless of its form.
 *
 * A description is already text. A page body is a document
 * ProseMirror, which is flattened block by block with the same utility as the
 * mention notifications (lib/pages-mentions.ts) — and not by projection
 * markdown: it is he who knows that a mention node is ATOMIC and renders its
 * “@label”, while a mention placed in the selector — the most common case — does not carry any child text.
 *
 * What it deliberately does not pick up: SUB-PAGE blocks. A parent who
 * carries their child's block is not "quoting" it in the sense of this sign — the
 * relationship is already on the screen, in the tree, and in the breadcrumbs, and the
 * repeating as "Quoted by" would make each subpage a guaranteed noise line
 *. The block has no text, so it comes out naturally.
 */
export function sourceText(source: {
  description?: string | null;
  doc?: unknown;
}): string {
  if (typeof source.description === "string") return source.description;
  if (source.doc == null) return "";
  return pageBlockTexts(source.doc)
    .map((block) => block.text)
    .join("\n");
}

/**
 * Rewrite links from ONE source. The only write gate in the table.
 *
 * End-to-end best effort: nothing goes back to the caller. A lost trackback
 * should not cause a successful write to fail — and the next
 * write to that source will catch up, since the rewrite is complete.
 */
export async function syncPageLinks(
  service: Service,
  source: PageLinkSource,
  text: string
): Promise<void> {
  // We CALCULATE before erasing: between the two, the source no longer has any links, and
  // this window should be as short as possible.
  const targets = text.includes("@")
    ? citedPageIds(text, await citablePages(service, source.projectId))
        // A page does not cite itself. The scanner does not know this:
        // he only sees a title in a text.
        .filter((pageId) => !(source.kind === "page" && pageId === source.id))
    : [];

  const { error: clearError } = await service
    .from("page_links")
    .delete()
    .eq("source_kind", source.kind)
    .eq("source_id", source.id);
  if (clearError) {
    console.error("[page-links] clear failed:", clearError.message);
    return;
  }

  if (targets.length === 0) return;

  const { error: writeError } = await service.from("page_links").insert(
    targets.map((pageId) => ({
      page_id: pageId,
      source_kind: source.kind,
      source_id: source.id,
      project_id: source.projectId,
    }))
  );
  if (writeError) {
    console.error("[page-links] write failed:", writeError.message);
  }
}

/** The same thing, after the response — what write paths call. */
export function queuePageLinks(
  service: Service,
  source: PageLinkSource,
  text: string | null | undefined
): void {
  afterOrNow(() => syncPageLinks(service, source, text ?? ""));
}

/**
 * The links carried by the BODY of these pages, reread from the base.
 *
 * Rereading costs a query and buys idempotence, exactly like
 * `syncPagesSearchText`: replaying the derivation on a page cannot do it
 * diverge, regardless of the order in which two concurrent writes
 * catch up. This is also what makes a catch-up replayable without risk.
 */
export async function syncPageBodyLinks(
  service: Service,
  pageIds: string[]
): Promise<void> {
  if (pageIds.length === 0) return;

  const { data, error } = await service
    .from("pages")
    .select("id, project_id, content")
    .in("id", pageIds);
  if (error) {
    console.error("[page-links] body read failed:", error.message);
    return;
  }

  for (const row of (data ?? []) as {
    id: string;
    project_id: string;
    content: unknown;
  }[]) {
    await syncPageLinks(
      service,
      { kind: "page", id: row.id, projectId: row.project_id },
      sourceText({ doc: row.content })
    );
  }
}

/** The same thing, after the response. The only caller of write paths. */
export function queuePageBodyLinks(service: Service, pageIds: string[]): void {
  if (pageIds.length === 0) return;
  afterOrNow(() => syncPageBodyLinks(service, pageIds));
}
