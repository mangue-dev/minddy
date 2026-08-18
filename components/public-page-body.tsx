"use client";

import { useMemo } from "react";
import type { JSONContent } from "@tiptap/core";

import { PageEditor } from "@/components/pages/page-editor";
import type { PagesLookup } from "@/components/pages/pages-lookup";

/**
 * The body of a PUBLISHED PAGE (MIN-283), rendered for someone who doesn't have a
 * account.
 *
 * This is the REAL editor, mounted read-only — the same choice as preview
 * of a version in history (MIN-277), and for the same reason: the editor
 * IS the rendering surface. A second rendering written next to it would end up diverging
 * on exactly the blocks that we look at the least - a leaflet, a resized image
 * -, and it would diverge silently: a published page is
 * precisely the one that its author never rereads.
 *
 * This that we do NOT give it, and each absence is a decision:
 *
 * - `mentions` / `mentionLinks`: a mention is of the TEXT in the document,
 * the pill being put back only upon reading by the surface which has it the
 * sources (MIN-269). Without them, “@Clément” and “@MIN-42” remain
 * text — no avatar, no link, nothing to learn from the project;
 * - `uploads`, `onComment`: nothing to write here, therefore nothing to upload or to
 * comment ;
 * - pages outside the published set: the lookup does not know them, and
 * their block becomes inert under a neutral label. Their title has never
 * left the server (see lib/server/page-publication.ts).
 */
export function PublicPageBody({
  content,
  pages,
  token,
  rootId,
  missingLabel,
}: {
  content: unknown;
  /** The PUBLISHED whole, and only him. */
  pages: Array<{ id: string; title: string; icon: string | null }>;
  token: string;
  /** The page that the link points to: she lives in `/p/<token>`, her daughters under. */
  rootId: string;
  /** What an unpublished subpage block says — never “trash”, which would be
 false, never its title, which would be the leak. */
  missingLabel: string;
}) {
  const lookup = useMemo<PagesLookup>(() => {
    const byId = new Map(pages.map((p) => [p.id, p]));
    const href = (id: string) =>
      id === rootId ? `/p/${token}` : `/p/${token}/${id}`;
    return {
      // `ready` straight away: the server has resolved everything, there is no waiting to
      // distinguish from an absence. A block without a page is therefore inert all the same.
      // continued, and the rest.
      ready: true,
      get: (id) => byId.get(id),
      href,
      // `navigate` is MANDATORY, even without an application router: click
      // ordinary on the anchor of a node view is preempted by the editor
      // (`handleNodeLinkClick`, components/editor-node-link.ts), which cuts off
      // the Link extension AND the default behavior, then leave the view
      // take over. Without this relay, clicking on a published subpage does
      // absolutely NOTHING.
      navigate: (id) => {
        window.location.href = href(id);
      },
      missingLabel,
    };
  }, [pages, token, rootId, missingLabel]);

  return (
    <PageEditor
      initialContent={(content as JSONContent | null) ?? null}
      onChange={() => {}}
      editable={false}
      pages={lookup}
    />
  );
}
