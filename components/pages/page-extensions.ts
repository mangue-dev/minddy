// THE DIAGRAM of a page — the catalog of blocks, plus the substrate it assumes.
//
// Two surfaces mount it, and they must mount THE SAME: the editor
// (components/pages/page-editor.tsx) and the markdown projection
// (lib/pages-markdown.ts, therefore the MCP and the agent). A knot that the editor knows
// produce and that the projection does not know, it is a block which disappears in
// silence as soon as an agent rereads the page — exactly the default that MIN-269
// exists to make impossible. Hence this file: one list, two
// lectures.
//
// What it DOES NOT have, and which remains for the editor: the chrome (margin, menu ⋯), the
// menu “/”, the mention suggestion, the placeholder, `NodeRange`. Nothing
// all this does not affect the schema or markdown.
//
// No “client use” here, voluntarily: this module must be able to be mounted
// outside browser. This is also why the mention HAPPENS as an option — its
// pill lives in a client module, and an imported server-side client module does not
// only renders a reference, not a tiptap extension.

import type { AnyExtension, Extensions, NodeViewRenderer } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import { HardBreak } from "@tiptap/extension-hard-break";
import { Text } from "@tiptap/extension-text";
import { MarkdownLinkMark } from "@/components/markdown-link-mark";
import UniqueID from "@tiptap/extension-unique-id";
import { Markdown } from "tiptap-markdown";
import { MentionNodeBase } from "@/components/mention-node";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
  PageBlockShortcuts,
  blockExtensions,
  pageColorExtensions,
  type BlockSet,
} from "@/components/pages/blocks";

export interface PageExtensionsOptions {
  /**
 * Without node view or browser behavior: the schema and the
 * serialization markdown, mountable under jsdom as in a function
 * server. This is what the projection takes.
 */
  headless?: boolean;

  /**
 * The mention node to mount. By default the NU
 * node (components/mention-node.ts): the text “@Name”, its schema and its
 * markdown. The editor passes the version which carries the pill — it is the same
 * node, with an additional view.
 */
  mention?: AnyExtension;

  /**
 * The node views that SURFACE brings, by node name. Same reason as
 * `mention`, and same form: a view that pulls the client UI primitives cannot
 * be named by a block file without making the register unimportable
 * outside the browser. This is where the task shared with the notebook goes through
 * (`taskItem`, cf. components/scratchpad/task-item-view.tsx).
 *
 * Ignored in `headless`, where there is no view.
 */
  nodeViews?: Record<string, NodeViewRenderer>;

  /** Optional browser-side replacements for extensions that need a richer
   * runtime configuration, such as the complete code grammar catalog. */
  extensions?: Record<string, AnyExtension>;

  /**
   * Which transactions `UniqueID` may stamp. A live editor (MIN-688) excludes
   * steps received from collaborators: their blocks already carry the IDs
   * their author's editor gave them, and stamping them again here would give
   * each collaborator a different ID for the same block.
   */
  uniqueIdFilter?: (transaction: Transaction) => boolean;

  /**
   * StarterKit's trailing paragraph. Off in a live editor (MIN-688): it is
   * appended from `appendTransaction`, so every collaborator would add their
   * own after a remote edit ends the page on another block. The reserve below
   * the body adds that paragraph on demand instead (`focusDocumentEnd`).
   */
  trailingNode?: boolean;

  /**
   * The block catalog (MIN-728). `page` by default; `document` is what issue
   * and objective descriptions, comments and the notebook mount — the same
   * engine without the page-tree blocks. The projection of a surface must
   * mount the same set as its editor, for the reason at the top of this file.
   */
  blocks?: BlockSet;
}

/**
 * Text as people typed it. tiptap-markdown writes every `<` and `>` of a text
 * node as an entity, so "5 > 3" reached Numo, agents, the forge and exports as
 * "5 &gt; 3". Only a `<` that could open an HTML tag, comment or declaration
 * needs escaping for the Markdown to read back the same (it is parsed with
 * `html: true`); a `>` at the start of a line is escaped by the serializer
 * itself, as a quote marker.
 */
export function escapeMarkdownTags(text: string): string {
  return text.replace(/<(?=[A-Za-z/!?])/g, "&lt;");
}

/** A line break on ⇧↵ only. StarterKit's also binds ⌘↵, and claiming that
    keystroke stopped every composer from sending with its send shortcut. */
const ShiftEnterHardBreak = HardBreak.extend({
  addKeyboardShortcuts() {
    return { "Shift-Enter": () => this.editor.commands.setHardBreak() };
  },
});

const MarkdownText = Text.extend({
  addStorage() {
    return {
      markdown: {
        serialize(state: { text(text: string): void }, node: { text?: string }) {
          state.text(escapeMarkdownTags(node.text ?? ""));
        },
        parse: {},
      },
    };
  },
});

export function pageExtensions(
  options: PageExtensionsOptions = {}
): Extensions {
  const {
    headless = false,
    mention = MentionNodeBase,
    nodeViews,
    extensions,
    uniqueIdFilter,
    trailingNode = true,
    blocks = "page",
  } = options;

  return [
    // The substrate: document, text, marks, undo/redo, links. All the
    // BLOCK nodes are cut — they come from the registry, and two definitions
    // from the same node raise tiptap.
    StarterKit.configure({
      text: false,
      paragraph: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      link: false,
      hardBreak: false,
      ...(trailingNode ? {} : { trailingNode: false }),
    }),
    MarkdownText,
    ShiftEnterHardBreak,
    MarkdownLinkMark,
    ...blockExtensions({ headless, nodeViews, extensions, set: blocks }),
    ...pageColorExtensions(),
    PageBlockShortcuts,
    mention,
    // The stable ID of the blocks, placed on BOTH sides: a page written in markdown
    // by Numo therefore arrives in the editor with blocks already identified, like
    // if a human had typed them.
    UniqueID.configure({
      attributeName: BLOCK_ID_ATTRIBUTE,
      types: BLOCK_ID_TYPES,
      ...(uniqueIdFilter ? { filterTransaction: uniqueIdFilter } : {}),
    }),
    Markdown.configure({
      // `true`: the leaflet and the subpage are projected in minimal HTML
      // (see blocks/details.ts and blocks/subpage.ts) — markdown has neither
      // the other. Without that, both would end up in escaped text.
      html: true,
      // `linkify` only in the EDITOR: a typed URL is transformed into
      // link, which is a service provided to humans. The projection must
      // be faithful — linking a bare URL would make it stand out
      // `[url](url)`, therefore a round trip which rewrites Numo's text.
      linkify: !headless,
      transformPastedText: !headless,
      transformCopiedText: !headless,
    }),
  ] as unknown as Extensions;
}
