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
// • the EDGE (`Decoration.node`): “there is a discussion here”, visible in
// browse the page without clicking anything;
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

import { PAGE_BLOCK_ID_ATTRIBUTE } from "@/lib/pages-mentions";

/** The classes that app/globals.css paints. */
const COMMENTED_CLASS = "page-block-commented";
const BADGE_CLASS = "page-block-comment-badge";

/** The attribute that carries the anchor: the layer reads it on click. */
const BLOCK_ATTR = "data-block-id";

export const blockCommentsKey = new PluginKey<DecorationSet>("blockComments");

/** How many messages per commented block — the count carried by the pastille. */
export type CommentedBlocks = ReadonlyMap<string, number>;

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

/** The sticker: the count, and the click which opens the thread. */
function badge(
  blockId: string,
  count: number,
  storage: BlockCommentsStorage
): HTMLElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = BADGE_CLASS;
  button.setAttribute(BLOCK_ATTR, blockId);
  button.setAttribute("aria-label", storage.label);
  button.title = storage.label;
  button.contentEditable = "false";
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    `<span>${count}</span>`;
  // `mousedown` rather than `click`, and `preventDefault` with: without that
  // ProseMirror first places the cursor, which closes the thread that we open in
  // moving the selection below it.
  button.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    storage.open?.(blockId);
  });
  return button;
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
    const count = typeof id === "string" ? blocks.get(id) : undefined;
    if (typeof id === "string" && count) {
      out.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: COMMENTED_CLASS,
          [BLOCK_ATTR]: id,
        })
      );
      // The widget is placed AT THE END of the block, and made out of flow by the CSS: at
      // start, it would be inserted before the first letter and shift the
      // text of a commented block in relation to its neighbors.
      out.push(
        Decoration.widget(pos + node.nodeSize - 1, () => badge(id, count, storage), {
          side: 1,
          // It is NOT from the document: neither copied with the selection, nor counted
          // in the positions that the block commands manipulate.
          ignoreSelection: true,
          marks: [],
        })
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
