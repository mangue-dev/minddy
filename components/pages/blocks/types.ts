// The DESCRIPTOR of a page block: the object which declares, in a single place,
// the six things a block actually is.
//
// A block is not a tiptap node. This is the node, PLUS its entry in the menu
// “/”, PLUS its entry in “transform into”, PLUS its icon, PLUS its
// labels FR/EN, PLUS its markdown serialization in both directions. Tiptap makes
// the modular node and says nothing about the other five: if they live in six
// files, add a table block in six months will mean six editions, and
// an oversight — an insertable block but missing “transform into”, translated from a
// single side, or lost on the round trip markdown.
//
// Hence the folder rule: ONE FILE PER BLOCK, which exports a `PageBlock`, and
// a single register (./index.ts) as the “/” menu, the ⋯ menu and the serializer
// iterate over all three. No consumer imports a block by name.
//
// What the compiler already has, without testing: a descriptor that is missing
// a field does not compile, and `labelKey` is typed `MessageKey<"Pages">` — a
// i18n key missing from the English catalog is a
// type error, not a `Pages.slashTableau` displayed on screen.
// What it does not hold, and that lib/pages-blocks.test.ts holds: the presence of
// the key in the FRENCH catalog, and the fact that the markdown of the block returns
// intact d'un aller-retour.

import type { Editor, Extensions, Range } from "@tiptap/core";
import type { LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * The attribute that carries the stable ID of a block. `blockId` and not `id`: the
 * document leaves JSON in the database, and a field named `id` in the middle of a
 * tree of nodes merges with the id of the PAGE on the first reread.
 *
 * It is he who gives the handle its target, the block link its anchor, the
 * saves its merger by block (MIN-271) and future comments theirs.
 *
 * It lives in this SHEET-module, and not in the register, so that the actions
 * from chrome (components/pages/block-actions.ts) can read it without importing
 * the catalog — the registry imports these actions for its shortcuts, and
 * two modules which import each other always end up raising
 * in the wrong order.
 */
export const BLOCK_ID_ATTRIBUTE = "blockId";

/** The identity of a block in the CATALOG — not the name of its tiptap node:
 the three titles are three blocks for a single `heading` node. */
export type PageBlockId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulletList"
  | "orderedList"
  | "taskList"
  | "quote"
  | "codeBlock"
  | "divider"
  | "details"
  | "subpage"
  | "image"
  | "file";

/** The sections of the “/” menu, in this order. */
export type SlashGroup = "basic" | "lists" | "advanced";

/* ── Markdown ─────────────────────────────────────────────────────────── */

/** The minimum serialization state of prosemirror-markdown that a
 block touches. The package does not publish its types on the tiptap-markdown side; we therefore declare
 what we use rather than passing everything in `any`. */
export interface MarkdownState {
  write(text: string): void;
  text(text: string, escape?: boolean): void;
  /** Escape what makes sense in markdown. `startOfLine` is only useful for
 texts placed at the start of the block; link text or alt text
 doesn't need it. */
  esc(text: string, startOfLine?: boolean): string;
  ensureNewLine(): void;
  renderContent(node: MarkdownNode): void;
  renderInline(node: MarkdownNode): void;
  renderList(
    node: MarkdownNode,
    delim: string,
    firstDelim: (index: number) => string
  ): void;
  closeBlock(node: MarkdownNode): void;
  wrapBlock(
    delim: string,
    firstDelim: string | null,
    node: MarkdownNode,
    fn: () => void
  ): void;
}

/** The minimum of the ProseMirror node that a block serializer touches. */
export interface MarkdownNode {
  type: { name: string };
  attrs: Record<string, unknown>;
  textContent: string;
  childCount: number;
  child(index: number): MarkdownNode;
}

export interface PageBlockMarkdown {
  /**
 * What this block writes in markdown — a MINIMAL and complete example.
 *
 * This is not documentation: it's the fixture that
 * lib/pages-blocks.test.ts rereads in a real editor, reserializes, and requires
 * identical. A block whose serialization starts on one side only makes
 * fail this test, not a round trip discovered six months later on a
 * real page.
 */
  sample: string;

  /**
 * Serialization specific to the block (WRITE direction). The registry grafts it onto the
 * node, in its `storage.markdown` — that's where tiptap-markdown reads it.
 *
 * Absent = the node already knows how to do it: either tiptap-markdown provides the
 * rule (the standard nodes), or the node carries it itself (the tasks du
 * notebook, see components/scratchpad/task-nodes.ts). The `sample` is what
 * proves it, in both cases.
 */
  toMarkdown?: (state: MarkdownState, node: MarkdownNode) => void;

  /**
 * Reading: the markdown-it rule that renders this block from markdown, when
 * markdown-it does not know it. Receives the markdown-it instance of
 * tiptap-markdown (typed `unknown`: its types are those of a transitive dependency
 *, cf. components/scratchpad/task-markdown.ts).
 *
 * Two traps, both checked in writing a bogus block:
 *
 * - the reading path is markdown-it → **HTML** → `parseHTML` of the node. A
 * rule that sets attributes on a `paragraph_open` does nothing: they
 * do not reach the HTML. Issue a `html_block` token, like
 * blocks/subpage.ts ;
 * does - this HTML must carry a tag that **no one else claims**. A
 * `<p data-type="…">` is caught by the `p` rule of the paragraph, which throws
 * the attributes in passing — the block is then reread as a paragraph, without a
 * error word. A `<div data-type="…">` passes.
 */
  fromMarkdown?: (markdownit: unknown) => void;
}

/* ── The descriptor ────────────────────────── ─────────────────────────── */

export interface PageBlock {
  /** Identity in the catalog. Unique across the entire register. */
  id: PageBlockId;

  /** The name of the tiptap NODE under this block (`"heading"` for all three titles). */
  nodeName: string;

  /**
 * The tiptap extensions that this block provides. Empty when another block of the same
 * node already brings them — title 1 rises `Heading`, titles 2 and 3 graft on it. The registry deduplicates by extension name and the structural test
 * checks that no node in the catalog is orphaned.
 */
  extensions: Extensions;

  icon: LucideIcon;
  labelKey: MessageKey<"Pages">;

  /** The “/” menu: where the block appears, and what it is looking for.
 aliases carry BOTH languages ​​— it's an entry, not a display. */
  slash: { group: SlashGroup; order: number; keywords: string[] };

  /**
 * Convert the current selection TO this block — the “transform to” menu.
 * `false` when it doesn't make sense: a subpage does not transform
 * from a paragraph, it is inserted.
 */
  turnInto: ((editor: Editor) => boolean) | false;

  /**
 * Place the block in place of the “/…” entry. Optional: without it, the
 * register infers it from `turnInto` (clear the range, then convert), which
 * covers all blocks that are a transformation of the current paragraph.
 */
  insert?: (editor: Editor, range: Range) => void;

  /** Is it THIS block that carries the selection? Used to check the current entry of
 “transform into” — hence the need for a test per block and not per node:
 `heading` is active for the three titles, `heading1` for only one. */
  isActive: (editor: Editor) => boolean;

  /**
 * The CONVERT shortcut to this block. Declared HERE and nowhere else:
 * the register makes the keyboard connection (`PageBlockShortcuts`) AND the label
 * displayed to the right of the “transform to” entry. A shortcut that would read
 * in the menu without it working, or vice versa, is therefore not
 * representable.
 *
 * The combinations are those of the notebook and tiptap extensions —
 * `⌘⌥1..3` for titles, `⌘⇧7/8/9` for lists: a user who
 * moves from a note to a page does not relearn anything. The register REDECLARES them
 * rather than letting each extension do so, to give them all the same
 * toggle semantics (the active block shortcut returns to the paragraph).
 */
  shortcut?: {
    /** The combination in ProseMirror notation (`Mod-Alt-1`). */
    keys: string;
    /** What the menu DISPLAYS (`⌘⌥1`). */
    display: string;
  };

  markdown: PageBlockMarkdown;
}
