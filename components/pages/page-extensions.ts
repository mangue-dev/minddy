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
import StarterKit from "@tiptap/starter-kit";
import UniqueID from "@tiptap/extension-unique-id";
import { Markdown } from "tiptap-markdown";
import { MentionNodeBase } from "@/components/mention-node";
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_ID_TYPES,
  PageBlockShortcuts,
  blockExtensions,
  pageColorExtensions,
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
 * `mention`, and same form: a view that fires the `mangue-ui` barrel cannot
 * be named by a block file without making the register unimportable
 * outside the browser. This is where the task shared with the notebook goes through
 * (`taskItem`, cf. components/scratchpad/task-item-view.tsx).
 *
 * Ignored in `headless`, where there is no view.
 */
  nodeViews?: Record<string, NodeViewRenderer>;
}

export function pageExtensions(
  options: PageExtensionsOptions = {}
): Extensions {
  const {
    headless = false,
    mention = MentionNodeBase,
    nodeViews,
  } = options;

  return [
    // The substrate: document, text, marks, undo/redo, links. All the
    // BLOCK nodes are cut — they come from the registry, and two definitions
    // from the same node raise tiptap.
    StarterKit.configure({
      paragraph: false,
      heading: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
    }),
    ...blockExtensions({ headless, nodeViews }),
    ...pageColorExtensions(),
    PageBlockShortcuts,
    mention,
    // The stable ID of the blocks, placed on BOTH sides: a page written in markdown
    // by Numo therefore arrives in the editor with blocks already identified, like
    // if a human had typed them.
    UniqueID.configure({
      attributeName: BLOCK_ID_ATTRIBUTE,
      types: BLOCK_ID_TYPES,
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
