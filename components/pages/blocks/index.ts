// THE REGISTER of page blocks.
//
// A single table, `PAGE_BLOCKS`, and three readings on it: the “/” menu, the
// “transform into” menu, and the assembly of extensions (so, in turn, the
// markdown serialization). No consumer imports a block by name —
// this is THE rule of this file, and it is what only adds a block
// tableau will ask for one file and one row here, not six scattered edits.
//
// What the registry guarantees, and that no one has to think about anymore:
// - a node mounted ONCE even when several blocks share it (the three
//    titres, `listItem` des deux listes) ;
// - the serialization declared on the descriptor grafted onto the correct node;
// - a grouped and ordered “/” menu, a “transform into” which only offers the
//    convertible.

import {
  Extension,
  type AnyExtension,
  type Editor,
  type Extensions,
  type NodeViewRenderer,
  type Range,
} from "@tiptap/core";
import { turnBlocksInto } from "@/components/pages/block-actions";
import type {
  PageBlock,
  PageBlockId,
  SlashGroup,
} from "@/components/pages/blocks/types";

import { paragraphBlock } from "@/components/pages/blocks/paragraph";
import {
  heading1Block,
  heading2Block,
  heading3Block,
} from "@/components/pages/blocks/heading";
import { bulletListBlock } from "@/components/pages/blocks/bullet-list";
import { orderedListBlock } from "@/components/pages/blocks/ordered-list";
import { taskListBlock } from "@/components/pages/blocks/task-list";
import { quoteBlock } from "@/components/pages/blocks/quote";
import { codeBlock } from "@/components/pages/blocks/code";
import { dividerBlock } from "@/components/pages/blocks/divider";
import { detailsBlock } from "@/components/pages/blocks/details";
import { subpageBlock } from "@/components/pages/blocks/subpage";
import { imageBlock } from "@/components/pages/blocks/image";
import { fileBlock } from "@/components/pages/blocks/file";

export type {
  PageBlock,
  PageBlockId,
  SlashGroup,
} from "@/components/pages/blocks/types";
export {
  PAGE_COLORS,
  PAGE_COLOR_MARK,
  PAGE_COLOR_ATTRIBUTE,
  activePageColor,
  pageColorExtensions,
  setPageColor,
  type PageColor,
  type PageColorKind,
} from "@/components/pages/blocks/color";

/** The catalog v1. Add a block = a file, and a line HERE. */
export const PAGE_BLOCKS: readonly PageBlock[] = [
  paragraphBlock,
  heading1Block,
  heading2Block,
  heading3Block,
  bulletListBlock,
  orderedListBlock,
  taskListBlock,
  quoteBlock,
  codeBlock,
  dividerBlock,
  detailsBlock,
  subpageBlock,
  imageBlock,
  fileBlock,
];

export const blockById = new Map<PageBlockId, PageBlock>(
  PAGE_BLOCKS.map((block) => [block.id, block])
);

/** Blocks that share a node, by node name — `heading` carries three.
    This is what anything that starts from the DOCUMENT rather than the menu reads. */
export const blocksByNodeName = PAGE_BLOCKS.reduce((map, block) => {
  const list = map.get(block.nodeName);
  if (list) list.push(block);
  else map.set(block.nodeName, [block]);
  return map;
}, new Map<string, PageBlock[]>());

/* ── The identity of a block in the document ────────────────────────────── */

/** Declared in blocks/types.ts, re-exported here: it is through the register that
    the whole depot reads it. The reason for the move is written there. */
export { BLOCK_ID_ATTRIBUTE } from "@/components/pages/blocks/types";

/** Nodes that receive a stable ID: ALL those in the catalog. Recalculates
    from the register — a new block is automatically identified. */
export const BLOCK_ID_TYPES = [
  ...new Set(PAGE_BLOCKS.map((block) => block.nodeName)),
];

/* ── Extensions ────────────────────────── ─────────────────────────── */

/** Grafts the `toMarkdown` / `fromMarkdown` of the descriptor onto the node, where
    tiptap-markdown reads it. Without declaration, the node keeps what it already has —
    the tiptap-markdown rule for standard nodes, its own serialization
    for notebook tasks. */
function withMarkdown(block: PageBlock, extension: AnyExtension): AnyExtension {
  const { toMarkdown, fromMarkdown } = block.markdown;
  if (!toMarkdown && !fromMarkdown) return extension;
  return extension.extend({
    addStorage() {
      return {
        ...this.parent?.(),
        markdown: {
          ...(toMarkdown ? { serialize: toMarkdown } : {}),
          parse: fromMarkdown ? { setup: fromMarkdown } : {},
        },
      };
    },
  });
}

/**
 * All extensions in the catalog, deduplicated by name.
 *
 * Deduplication is not a precaution: it is what allows each
 * block file to declare enough to stand STANDING ALONE (the numbered list
 * brings `listItem` like the bulleted list), without having to mount both
 * raise tiptap on a duplicate extension.
 *
 * `headless` removes React views from nodes: SCHEMA and serialization
 * markdown without a rendered line. This is what everyone who reads or
 * writes a page outside of a browser — markdown projection, MCP tools,
 * and testing. Without that, building the catalog would require React and a `<EditorContent>`.
 *
 * `nodeViews` does the opposite: it GRAFTS a view onto a node, by name. This is the
 * path of views that the catalog cannot carry itself — the task
 * shared with the notebook (components/scratchpad/task-item-view.tsx) pulls the
 * barrel `mangue-ui`, so a block file that named it would render the
 * entire register unimportable outside browser (see lib/cx.ts). The knot remains
 * in register, the view comes from the surface - exactly the sharing that
 * `pageExtensions({ mention })` already does for the mention pill.
 */
export function blockExtensions(
  options: {
    headless?: boolean;
    nodeViews?: Record<string, NodeViewRenderer>;
    extensions?: Record<string, AnyExtension>;
  } = {}
): Extensions {
  const seen = new Set<string>();
  const extensions: AnyExtension[] = [];
  for (const block of PAGE_BLOCKS) {
    for (const extension of block.extensions as AnyExtension[]) {
      if (seen.has(extension.name)) continue;
      seen.add(extension.name);
      const baseExtension = options.extensions?.[extension.name] ?? extension;
      const withStorage =
        extension.name === block.nodeName
          ? withMarkdown(block, baseExtension)
          : baseExtension;
      const view = options.nodeViews?.[extension.name];
      extensions.push(
        options.headless
          ? // `null` and NOT `undefined`, and that's anything but a stylistic detail:
            // `getExtensionField` of tiptap goes back to the PARENT extension from
            // qu'un champ vaut `undefined` (helpers/getExtensionField.ts). Un
            // `addNodeView: undefined` therefore removes nothing — it regains sight
            // from the original extension, and `headless` was not at all.
            // On the server, this view is a CLIENT reference
            // (`@tiptap/react` porte « use client ») : l'appeler faisait lever
            // « Attempted to call ReactNodeViewRenderer() from the server »
            // on the first page tool of Numo, MCP or agent.
            // `null` does not return, and the tiptap filter reads it as
            // “no view” (`!!getExtensionField(…, "addNodeView")`).
            withStorage.extend({ addNodeView: null })
          : view
            ? withStorage.extend({ addNodeView: () => view })
            : withStorage
      );
    }
  }
  return extensions;
}

/* ── The “/” menu ─────────────────────────── ─────────────────────────── */

/** The sections of the catalog, in the sort order of the menu. */
export const SLASH_GROUPS: ReadonlyArray<{
  group: SlashGroup;
}> = [
  { group: "basic" },
  { group: "lists" },
  { group: "advanced" },
];

/** The catalog in the order of the “/” menu: group by group, `order` by
    `order`. LABELS are not resolved here — the registry has no
    translator, it renders descriptors and the menu displays them. */
export function slashItems(): PageBlock[] {
  const rank = new Map(SLASH_GROUPS.map(({ group }, index) => [group, index]));
  return [...PAGE_BLOCKS].sort(
    (a, b) =>
      (rank.get(a.slash.group) ?? 0) - (rank.get(b.slash.group) ?? 0) ||
      a.slash.order - b.slash.order
  );
}

/** Place the block in place of the “/…” entry. Without `insert` declared, it is
    “clear range, then convert” — which covers any block that is a
    transformation du paragraphe courant. */
export function insertBlock(
  block: PageBlock,
  editor: Editor,
  range: Range
): void {
  if (block.insert) {
    block.insert(editor, range);
    return;
  }
  editor.chain().focus().deleteRange(range).run();
  if (block.turnInto) block.turnInto(editor);
}

/* ── Conversion shortcuts ─────────────────────────────────────── */

/**
 * The `shortcut` shortcuts from the catalog, mounted in a single extension.
 *
 * Two properties which justify resuming by hand what the extensions
 * tiptap already do each on their own:
 *
 * - a shortcut is DECLARED with the block, next to its label and its
 * icon. The menu displays the same one that the keyboard triggers: they do not
 *    peuvent pas diverger, parce qu'il n'y en a qu'un ;
 * - all have the same TOGGLE semantics — the active block shortcut brings back
 * in paragraph. Without that, `⌘⌥1` switches (Heading) but `⌘⌥D` does not (Details),
 * and the editor responds differently depending on the block under the cursor.
 *
 * `priority` above 100 by default: the register link therefore passes
 * BEFORE that of the extension of the node, and it is she who responds.
 */
export const PageBlockShortcuts = Extension.create({
  name: "pageBlockShortcuts",
  priority: 200,

  addKeyboardShortcuts() {
    const bindings: Record<string, () => boolean> = {};
    for (const block of PAGE_BLOCKS) {
      const { shortcut, turnInto } = block;
      if (!shortcut || !turnInto) continue;
      bindings[shortcut.keys] = () => {
        const editor = this.editor as unknown as Editor;
        // `turnBlocksInto` and not `turnInto`: the conversion covers the entire
        // selection, delinked lists included (see block-actions.ts). The menu ⋯
        // goes through the same door — a shortcut that would convert otherwise than
        // the menu entry that displays it would be worse than no shortcut.
        if (block.id !== "paragraph" && block.isActive(editor)) {
          return turnBlocksInto(editor, paragraphBlock);
        }
        return turnBlocksInto(editor, block);
      };
    }
    return bindings;
  },
});

/* ── The “transform to” menu ──────────────────── ───────────────────── */

/** What the current selection can be transformed to, with the input
    active marked. Menu order “/” — only one order to remember. */
export function turnIntoItems(
  editor: Editor
): Array<{ block: PageBlock; active: boolean }> {
  return slashItems()
    .filter((block) => block.turnInto !== false)
    .map((block) => ({ block, active: block.isActive(editor) }));
}
