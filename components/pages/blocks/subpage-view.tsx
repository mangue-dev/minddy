"use client";

import { useState } from "react";
import type { NodeViewRenderer } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { useTranslations } from "next-intl";
// `cx` and not `cn` of mango-ui: the barrel draws the emoji selector, and the
// block register would cease to be importable outside the browser (see cx.ts).
import { cx } from "@/components/pages/blocks/cx";
import { FileText, RotateCcw } from "lucide-react";
import {
  NODE_LINK_CLASS,
  isPlainNavigationClick,
} from "@/components/editor-node-link";
import { usePagesLookup } from "@/components/pages/pages-lookup";

/**
 * The view of a subpage block: the icon and title of the TARGET page, reread at
 * each rendering from the project cache — never copied into the node.
 *
 * Three states, and the third is the one that counts (MIN-272):
 *
 * - the page is there: its icon, its title, and a link to it;
 * - the cache has not finished loading: the same line, waiting;
 * - the page is NO LONGER there — trashed by another tab, or block left
 * behind by reparenting. The block then becomes DEACTIVATED, allowing
 * to be removed from the trash. Never an empty line, never a crash:
 * a block that silently disappears from the document would make you doubt what you have
 * written, where a crossed out line says exactly what happened.
 */
export function SubpageView({ node, selected }: NodeViewProps) {
  const t = useTranslations("Pages");
  const lookup = usePagesLookup();
  const pageId = (node.attrs.pageId as string | null) ?? null;
  const page = pageId ? lookup?.get(pageId) : undefined;
  const [restoring, setRestoring] = useState(false);

  // Orphan: the cache is loaded, and it does not know this page. A block
  // without `pageId` at all (creation which was not successful) is not an orphan — it
  // never pointed anywhere.
  const orphan = !!pageId && !page && lookup?.ready === true;
  const href = page && lookup?.href ? lookup.href(page.id) : null;

  // State the BODY typography explicitly: the block is a document line, not a
  // title. A heavier weight would make it read as a section. It intentionally
  // remains distinct from ordinary Markdown links, which use their own class.
  //
  // The only underlining is therefore ours, and it is PALER than the text:
  // he says “this leads elsewhere” without demanding the eye, as in Notion. A
  // stroke of the text color makes a line as black as the letters, and
  // this is what gave the block its title look.
  const label = (
    <span
      className={cx(
        "truncate text-base font-normal",
        page &&
          "text-foreground underline decoration-muted-foreground/40 decoration-1 underline-offset-4",
        !page && "text-muted-foreground no-underline",
        orphan && "line-through"
      )}
    >
      {page
        ? page.title || t("untitled")
        : orphan
          ? (lookup?.missingLabel ?? t("subpageMissing"))
          : t("subpageUntitled")}
    </span>
  );

  return (
    <NodeViewWrapper
      as="div"
      data-page-id={pageId}
      data-orphan={orphan || undefined}
      // `py-1` and not `py-1.5`: the gutter (handle + `+`) is centered on the
      // hauteur de LIGNE du bloc, rembourrage compris (block-gutter.tsx). Plus
      // the line deviates from that of a paragraph, the more the margin moves away from it
      // to the eye — a padded body line keeps both
      // aligned as on the other blocks.
      className={cx(
        "my-1 flex items-center gap-2 rounded-lg px-2 py-1 leading-relaxed transition-colors",
        !orphan && "hover:bg-muted",
        selected && "bg-muted ring-1 ring-ring"
      )}
      contentEditable={false}
    >
      {page?.icon ? (
        <span className="shrink-0 text-base leading-relaxed">{page.icon}</span>
      ) : (
        <FileText
          className={cx(
            "size-4 shrink-0 text-muted-foreground",
            orphan && "opacity-60"
          )}
        />
      )}

      {href ? (
        // A real anchor: the ⌘-click and the middle click open the page in
        // a tab, like everywhere else. A `onClick` on a `div` does not know
        // faire ni l'un ni l'autre.
        // `editor-node-link` is not a utility class: it is the brand
        // by which the editor leaves this anchor alone — nor its color
        // link, nor its `window.open` (components/editor-node-link.ts, and
        // page-editor.tsx for `PROSE` and `handleClick`).
        //
        // A real anchor, not a clickable `div`: ⌘-click, middle click and
        // “open in new tab” context menu come with, and
        // no `onClick` knows how to redo them. The ORDINARY click goes through
        // the router — an application navigation, not a reload.
        <a
          href={href}
          className={cx(NODE_LINK_CLASS, "min-w-0 flex-1 truncate")}
          onClick={(event) => {
            if (!isPlainNavigationClick(event)) return;
            event.preventDefault();
            lookup?.navigate?.(pageId!);
          }}
        >
          {label}
        </a>
      ) : (
        <span className="min-w-0 flex-1 truncate">{label}</span>
      )}

      {orphan && lookup?.restore && (
        <button
          type="button"
          disabled={restoring}
          className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          onClick={() => {
            setRestoring(true);
            void lookup
              .restore?.(pageId)
              .finally(() => setRestoring(false));
          }}
        >
          <RotateCcw className="size-3" />
          {t("subpageRestore")}
        </button>
      )}
    </NodeViewWrapper>
  );
}

/**
 * The view, ready to be grafted onto the subpage node (blocks/subpage.ts) — by
 * the page editor, which injects it into `pageExtensions({ nodeViews })`.
 *
 * It lives HERE and not on the node because this file is a client module :
 * the node is mounted outside the browser by the markdown projection (MCP,
 * Numo, agent), and a client reference called from the server raises.
 */
export function subpageNodeView(): NodeViewRenderer {
  // Same artifact types as the task view (task-item-view.tsx): two
  // copies of @tiptap/core of the SAME version, so two type identities for one
  // seul runtime.
  return ReactNodeViewRenderer(SubpageView) as unknown as NodeViewRenderer;
}
