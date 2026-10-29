// Comments ON THE BLOCK (MIN-282) — the border, and the patch that opens
// the thread.
//
// ─── Why a DECORATION, and not a mark in the document ───────────────
//
// A mark would be CONTENT. She would therefore leave for base with the body, then
// in the markdown projection (lib/pages-markdown.ts) that Numo, the agent, reads
// of code and the MCP — which have no syntax to say it, would lose it
// proofreading, and would render a document slightly different from the one they have
// read. A round trip that invents text, for information that is not even
// not in the document: it is in `page_comments`.
//
// Same reason as blinking (components/pages/block-flash.ts), plus one:
// here all the blocks concerned change with each comment written by
// anyone, real time included. A decoration replaces a
// transaction without touching the body — therefore without undo history,
// persistence, or version conflict.
//
// ─── Two decorations, and they don't say the same thing ─────────────────
//
// • the BLOCK (`Decoration.node`): “there is a discussion here” — the class
// the CSS gives the comments' yellow, with the quoted passages that still
// exist underlined and tinted (`Decoration.inline`), visible while browsing
// the page without clicking anything;
// • the PASTILLE (`Decoration.widget`): the message count, and the button
// which opens the thread NEXT TO THE BLOCK. She is the one who keeps the discussion alive
// on the text she is talking about rather than in a footer.
//
// The widget is bare DOM, not React: ProseMirror mounts and unmounts it
// itself each time the node is rendered, and a React portal there is
// would go up in the middle of the commit phase. He therefore calls a hook placed on the
// `storage` of the extension, which the comments layer provides (cf.
// components/pages/page-comment-layer.tsx).

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BlockCommentBadge } from "@/components/pages/block-comment-badge";
import { commentButtonOffset } from "@/components/pages/block-chrome-geometry";
import { pageCommentHighlightRanges } from "@/lib/page-comment-highlights";
import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";

/** The classes that app/globals.css paints. */
export const COMMENTED_BLOCK_CLASS = "page-block-commented";
const COMMENTED_PASSAGE_CLASS = "page-commented-passage";

/** The attribute that carries the anchor: the layer reads it on click. */
const BLOCK_ATTR = "data-block-id";
/** The widget that holds a block's badge, placed by `placeBadge`. */
const BADGE_HOST_CLASS = "page-block-comment-host";

export const blockCommentsKey = new PluginKey<DecorationSet>("blockComments");

export interface CommentedBlockDecoration {
  /** How many messages the badge reports. */
  count: number;
  /** Frozen passages that should be underlined if they still exist. */
  quotes: readonly string[];
}

export type CommentedBlocks = ReadonlyMap<string, CommentedBlockDecoration>;

/** What the extension keeps for the layer: the thread opening hook, and
 the tag label (the widget cannot read the i18n catalog). */
export interface BlockCommentsStorage {
  open: ((blockId: string) => void) | null;
  label: string;
}

/** The block ids carried by a document — the set against which se
 calculates the DETACHMENT of a thread (lib/page-comments.ts). Read on the editor
 alive, not on the last save: a block deleted one second ago
 is no longer there, even if the database still has it. */
export function documentBlockIds(editor: Editor | null): Set<string> {
  const ids = new Set<string>();
  if (!editor || editor.isDestroyed) return ids;
  editor.state.doc.descendants((node) => {
    const id = node.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    if (typeof id === "string" && id) ids.add(id);
    // First level only: this is where the anchor lives (same granularity as
    // `pageBlockTexts` and the block handle).
    return false;
  });
  return ids;
}

const badgeRoots = new WeakMap<globalThis.Node, Root>();

/** The badge uses the same React tooltip primitive as the rest of the app. */
function badge(
  blockId: string,
  count: number,
  storage: BlockCommentsStorage
): HTMLElement {
  const host = document.createElement("span");
  host.contentEditable = "false";
  host.className = BADGE_HOST_CLASS;
  const root = createRoot(host);
  root.render(
    createElement(BlockCommentBadge, {
      blockId,
      count,
      label: storage.label,
      onOpen: (id: string) => storage.open?.(id),
    })
  );
  badgeRoots.set(host, root);
  return host;
}

/**
 * Puts a badge where the block's new-comment button appears (block-gutter.tsx):
 * centred on its first line, at the same distance to the right of the text.
 * Out of flow, it is measured against the box it is positioned in; on a
 * narrow screen the CSS puts it back in the line, and nothing is placed.
 */
function placeBadge(host: HTMLElement): void {
  const block = host.parentElement?.closest<HTMLElement>(`[${BLOCK_ATTR}]`);
  const parent = host.offsetParent;
  if (!block || !(parent instanceof HTMLElement) || getComputedStyle(host).position !== "absolute") {
    host.style.top = "";
    host.style.left = "";
    return;
  }
  const offset = commentButtonOffset(block);
  const at = block.getBoundingClientRect();
  const frame = parent.getBoundingClientRect();
  host.style.top = `${Math.round(at.top - frame.top - parent.clientTop + offset.top)}px`;
  host.style.left = `${Math.round(at.left - frame.left - parent.clientLeft + offset.left)}px`;
}

function destroyBadge(dom: globalThis.Node): void {
  const root = badgeRoots.get(dom);
  if (!root) return;
  badgeRoots.delete(dom);
  // Decoration teardown can happen inside a React-driven editor update.
  // Defer unmounting so React never destroys a root during another render.
  queueMicrotask(() => root.unmount());
}

function decorationsFor(
  doc: Node,
  blocks: CommentedBlocks,
  storage: BlockCommentsStorage
): Decoration[] {
  const out: Decoration[] = [];
  if (blocks.size === 0) return out;
  doc.descendants((node, pos) => {
    const id = node.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    const annotation = typeof id === "string" ? blocks.get(id) : undefined;
    if (typeof id === "string" && annotation) {
      out.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: COMMENTED_BLOCK_CLASS,
          [BLOCK_ATTR]: id,
        })
      );
      for (const range of pageCommentHighlightRanges(
        node,
        pos,
        annotation.quotes
      )) {
        out.push(
          Decoration.inline(range.from, range.to, {
            class: COMMENTED_PASSAGE_CLASS,
          })
        );
      }
      // The widget is placed AT THE END of the block, and made out of flow by the CSS: at
      // start, it would be inserted before the first letter and shift the
      // text of a commented block in relation to its neighbors.
      out.push(
        Decoration.widget(
          pos + node.nodeSize - 1,
          () => badge(id, annotation.count, storage),
          {
            side: 1,
            // It is NOT from the document: neither copied with the selection, nor counted
            // in the positions that the block commands manipulate.
            ignoreSelection: true,
            marks: [],
            destroy: destroyBadge,
          }
        )
      );
    }
    return false;
  });
  return out;
}

/**
 * The extension to mount in the editor (components/pages/page-editor.tsx).
 *
 * It does not touch the document: nothing it does goes to base, does not
 * enters the cancellation history, nor does it trigger automatic recording
 * (a transaction without document change does not emit `update`).
 */
export const BlockComments = Extension.create<
  Record<string, never>,
  BlockCommentsStorage
>({
  name: "blockComments",

  addStorage() {
    return { open: null, label: "Comments" };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    return [
      new Plugin<DecorationSet>({
        key: blockCommentsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(blockCommentsKey) as CommentedBlocks | undefined;
            if (meta) {
              return DecorationSet.create(
                tr.doc,
                decorationsFor(tr.doc, meta, storage)
              );
            }
            // Nobody announced anything: the decorations follow their blocks.
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations: (state) => blockCommentsKey.getState(state),
        },
        // The badges follow their blocks: after every update of the view,
        // and whenever the document's box changes size (a window resize, an
        // image that loads, a panel that opens).
        view: (view) => {
          const layout = () => {
            for (const host of view.dom.querySelectorAll<HTMLElement>(`.${BADGE_HOST_CLASS}`)) placeBadge(host);
          };
          const observer = typeof ResizeObserver === "function" ? new ResizeObserver(layout) : null;
          observer?.observe(view.dom);
          layout();
          return { update: layout, destroy: () => observer?.disconnect() };
        },
      }),
    ];
  },
});

/** Announces the blocks which have an open thread, and their message count. */
export function setCommentedBlocks(
  editor: Editor,
  blocks: CommentedBlocks
): void {
  if (editor.isDestroyed) return;
  editor.view.dispatch(
    editor.state.tr
      .setMeta(blockCommentsKey, blocks)
      // Neither in history, nor treated as writing from outside
      // by the extensions which distinguish the two (the block handle).
      .setMeta("addToHistory", false)
  );
}
