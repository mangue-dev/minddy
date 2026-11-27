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
// The thread that is OPEN is a third piece of state (MIN-1002): its passages
// are emphasized, and the passage of a comment being written is tinted before
// the comment exists. The thread's popover anchors itself on those passages
// (components/pages/page-comment-thread.tsx). A click on a commented passage
// opens its thread, as the badge does.
//
// The widget is bare DOM, not React: ProseMirror mounts and unmounts it
// itself each time the node is rendered, and a React portal there is
// would go up in the middle of the commit phase. He therefore calls a hook placed on the
// `storage` of the extension, which the comments layer provides (cf.
// components/pages/page-comment-layer.tsx).

import { Extension } from "@tiptap/core";
import type { Editor } from "@tiptap/core";
import type { Node } from "@tiptap/pm/model";
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { createElement } from "react";
import { mountWidgetRoot } from "@/components/editor/widget-root";

import { BlockCommentBadge } from "@/components/pages/block-comment-badge";
import { commentButtonOffset } from "@/components/pages/block-chrome-geometry";
import { pageBlockContentRanges, pageCommentHighlightRanges } from "@/lib/page-comment-highlights";
import { isMobileLayout } from "@/lib/app-layout";
import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";

/** The classes that app/globals.css paints. */
export const COMMENTED_BLOCK_CLASS = "page-block-commented";
export const COMMENTED_PASSAGE_CLASS = "page-commented-passage";
/** A block whose thread is open: the CSS emphasizes its passages. */
export const OPEN_BLOCK_CLASS = "page-block-comment-open";
/** A block whose margin card is under the pointer: emphasized the same way. */
const HOVERED_BLOCK_CLASS = "page-block-comment-hover";
/** A commented block with no text to tint (a divider, an image, an equation):
    it is outlined instead. */
const OUTLINED_BLOCK_CLASS = "page-block-comment-outline";
/** A block a comment is being written on, and the passage it will quote:
    only that passage is emphasized. */
const DRAFT_BLOCK_CLASS = "page-block-comment-draft";
const DRAFT_PASSAGE_CLASS = "page-commented-passage-draft";

/**
 * The passages the open thread of a block is about, for the thread's popover
 * to stand under (components/pages/page-comment-thread.tsx).
 */
export function openPassages(block: HTMLElement): Element[] {
  const selector = block.classList.contains(DRAFT_BLOCK_CLASS)
    ? `.${DRAFT_PASSAGE_CLASS}`
    : `.${COMMENTED_PASSAGE_CLASS}`;
  return [...block.querySelectorAll(selector)];
}

/** The attribute that carries the anchor: the layer reads it on click. */
export const BLOCK_ATTR = "data-block-id";
/** The widget that holds a block's badge, placed by `placeBadge`. */
const BADGE_HOST_CLASS = "page-block-comment-host";

export const blockCommentsKey = new PluginKey<DecorationSet>("blockComments");

/** The thread that is open, or the comment being written. */
export interface ActiveBlockComment {
  blockId: string;
  /** The passage a new comment is about. Absent: every passage of the block. */
  quote?: string | null;
}

interface BlockCommentsMeta {
  blocks: CommentedBlocks;
  active: ActiveBlockComment | null;
  /** The block whose margin card is under the pointer. */
  hovered: string | null;
}

export interface CommentedBlockDecoration {
  /** How many messages the badge reports. */
  count: number;
  /** Frozen passages that should be underlined if they still exist. */
  quotes: readonly string[];
  /** A thread quotes no passage: the whole block is marked. */
  whole: boolean;
}

export type CommentedBlocks = ReadonlyMap<string, CommentedBlockDecoration>;

/** What the extension keeps for the layer: the thread opening hook, and
 the tag label (the widget cannot read the i18n catalog). */
export interface BlockCommentsStorage {
  /** The badge toggles its thread; a click on a passage only opens it. */
  open: ((blockId: string, source: "badge" | "passage") => void) | null;
  /** The commented block whose passage is under the pointer, or none. */
  hover: ((blockId: string | null) => void) | null;
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

const badgeTeardowns = new WeakMap<globalThis.Node, () => void>();

/** The badge uses the same React tooltip primitive as the rest of the app. */
function badge(
  blockId: string,
  count: number,
  storage: BlockCommentsStorage
): HTMLElement {
  const host = document.createElement("span");
  host.contentEditable = "false";
  host.className = BADGE_HOST_CLASS;
  badgeTeardowns.set(
    host,
    mountWidgetRoot(
      host,
      createElement(BlockCommentBadge, {
        blockId,
        count,
        label: storage.label,
        onOpen: (id: string) => storage.open?.(id, "badge"),
      })
    )
  );
  return host;
}

/**
 * Puts a badge where the block's new-comment button appears (block-gutter.tsx):
 * centred on its first line, at the same distance to the right of the text.
 * Out of flow, it is measured against the box it is positioned in; on a
 * narrow screen the CSS puts it back in the line, and nothing is placed.
 */
function placeBadge(host: HTMLElement): void {
  // The widget stands at the end of its block; beside a block that holds no
  // position inside (a divider, an image), it comes out just before it.
  const next = host.nextElementSibling;
  const block =
    host.parentElement?.closest<HTMLElement>(`[${BLOCK_ATTR}]`) ??
    (next instanceof HTMLElement && next.hasAttribute(BLOCK_ATTR) ? next : null);
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
  badgeTeardowns.get(dom)?.();
  badgeTeardowns.delete(dom);
}

function decorationsFor(
  doc: Node,
  { blocks, active, hovered }: BlockCommentsMeta,
  storage: BlockCommentsStorage
): Decoration[] {
  const out: Decoration[] = [];
  if (blocks.size === 0 && !active) return out;
  doc.descendants((node, pos) => {
    const id = node.attrs?.[PAGE_BLOCK_ID_ATTRIBUTE];
    if (typeof id !== "string") return false;
    const annotation = blocks.get(id);
    const open = active?.blockId === id;
    if (!annotation && !open) return false;
    // The passage of a comment being written is not in the saved quotes yet.
    const draft = open ? active.quote?.trim() || null : null;
    // The open state is carried by the BLOCK's class alone. Opening a thread
    // from a click in its passage must not redraw that passage: the caret the
    // click just placed is inside it, and a redrawn text loses it.
    // A thread that quotes nothing is about the block as a whole, and so is
    // a first comment being written on it: all of its text is marked.
    const whole = annotation ? annotation.whole : open && !draft;
    out.push(
      Decoration.node(pos, pos + node.nodeSize, {
        class: [
          annotation && COMMENTED_BLOCK_CLASS,
          open && OPEN_BLOCK_CLASS,
          draft && DRAFT_BLOCK_CLASS,
          annotation && hovered === id && HOVERED_BLOCK_CLASS,
          whole && node.textContent === "" && OUTLINED_BLOCK_CLASS,
        ]
          .filter(Boolean)
          .join(" "),
        [BLOCK_ATTR]: id,
      })
    );
    if (whole) {
      // The passages its other threads quote are inside what is marked.
      for (const range of pageBlockContentRanges(node, pos)) {
        out.push(
          Decoration.inline(
            range.from,
            range.to,
            { class: COMMENTED_PASSAGE_CLASS },
            { inclusiveStart: true, inclusiveEnd: true }
          )
        );
      }
    }
    const quotes = new Set(whole ? [] : annotation?.quotes.map((quote) => quote.trim()).filter(Boolean));
    if (draft) quotes.add(draft);
    for (const quote of quotes) {
      for (const range of pageCommentHighlightRanges(node, pos, [quote])) {
        out.push(
          Decoration.inline(range.from, range.to, {
            class: quote === draft ? `${COMMENTED_PASSAGE_CLASS} ${DRAFT_PASSAGE_CLASS}` : COMMENTED_PASSAGE_CLASS,
          })
        );
      }
    }
    if (annotation) {
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
            // A badge is drawn again only when its count changes.
            key: `${id}:${annotation.count}`,
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
    return { open: null, hover: null, label: "Comments" };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    let hoveredPassage: string | null = null;
    const reportHover = (blockId: string | null) => {
      if (blockId === hoveredPassage) return;
      hoveredPassage = blockId;
      storage.hover?.(blockId);
    };
    return [
      new Plugin<DecorationSet>({
        key: blockCommentsKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, set) {
            const meta = tr.getMeta(blockCommentsKey) as BlockCommentsMeta | undefined;
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
          // A click on a commented passage opens its thread and still places
          // the caret. Not on a phone: the thread is a sheet there, and a tap
          // in the text is how one starts typing.
          // The passage under the pointer is told to the layer, which lights
          // its margin card. Only changes are reported: `mouseover` fires for
          // every element the pointer crosses.
          handleDOMEvents: {
            mouseover: (_view, event) => {
              const target = event.target instanceof Element ? event.target : null;
              reportHover(
                target
                  ?.closest(`.${COMMENTED_PASSAGE_CLASS}`)
                  ?.closest(`[${BLOCK_ATTR}]`)
                  ?.getAttribute(BLOCK_ATTR) ?? null
              );
              return false;
            },
            mouseleave: () => {
              reportHover(null);
              return false;
            },
          },
          handleClick: (view, pos, event) => {
            if (event.button !== 0 || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return false;
            if (isMobileLayout()) return false;
            const target = event.target instanceof Element ? event.target : null;
            const blockId = target
              ?.closest(`.${COMMENTED_PASSAGE_CLASS}`)
              ?.closest(`[${BLOCK_ATTR}]`)
              ?.getAttribute(BLOCK_ATTR);
            if (!blockId) return false;
            // The browser has placed the caret, and the editor reads it a
            // moment later. Opening the thread dispatches a transaction
            // before that on a quick click (a trackpad tap), which would
            // write the previous selection back and stretch it to the click.
            // The click's position is known here: the caret is set now.
            const { selection, doc } = view.state;
            if (!selection.empty || selection.from !== pos) {
              view.dispatch(view.state.tr.setSelection(TextSelection.near(doc.resolve(pos))));
            }
            storage.open?.(blockId, "passage");
            return false;
          },
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

/** Announces the blocks that carry a thread, their message count, the thread
    that is open and the one whose margin card is under the pointer. */
export function setCommentedBlocks(
  editor: Editor,
  blocks: CommentedBlocks,
  active: ActiveBlockComment | null = null,
  hovered: string | null = null
): void {
  if (editor.isDestroyed) return;
  const meta: BlockCommentsMeta = { blocks, active, hovered };
  editor.view.dispatch(
    editor.state.tr
      .setMeta(blockCommentsKey, meta)
      // Neither in history, nor treated as writing from outside
      // by the extensions which distinguish the two (the block handle).
      .setMeta("addToHistory", false)
  );
}
