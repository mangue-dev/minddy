import { Node } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { FileText } from "lucide-react";
import { escapeHtmlAttribute } from "@/components/pages/blocks/escape";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * The SUB-PAGE block: an atomic node which ONLY carries the id of the target page.
 *
 * No title copied in, deliberately: renaming a page would leave
 * if not his old name in the body of all his parents. The title and icon
 * are resolved when displayed from the project cache
 * (components/pages/pages-lookup.tsx).
 *
 * The node also carries the DETECTION of its own disappearance (MIN-272): to
 * each update of the document, the pages cited before and after are
 * compared, and those which have just come out are announced to the publisher, who
 * asks for confirmation then puts them in the trash. What this file does
 * PAS: speak to the base — it only knows two square brackets, `create` and
 * `removed`, placed by components/pages/page-view.tsx.
 *
 * Why detection rather than a “delete” button: the block leaves
 * a dozen gestures — backspace, menu ⋯, cut, select all,
 * slide out of the document. To intercept them one by one is to forget some; THE
 * The document always tells the truth.
 *
 * ── REPARENTING, and it’s the kind of subtlety that we otherwise rediscover ──
 *
 * Moving a page in the sidebar tree changes `parent_id` and DOES NOT MOVE
 * NOT its block: this remains in the body where it was written, and becomes a
 * simple link to a page that now lives elsewhere. This is deliberate and not
 * un manque.
 *
 * The reason lies in the meaning of the two objects. The block is a sentence in the document —
 * he has a place in a text, between two paragraphs that talk about him.
 * To cut it out of one body and put it back together at the end of another would destroy
 * this place to replace it with nothing, and would make a gesture of ORGANIZATION
 * (place a page elsewhere) a modification of the TEXT of two pages that
 * no one asked — at the one who may have opened them at the moment
 * even.
 *
 * The consequence to be assumed: after reparenting, the body of the former parent
 * cites a page who is no longer his daughter. The block continues to march, it
 * simply no longer announces nesting. This is what `parent_id` is
 * truth means concretely.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    subpage: {
      /** Place a subpage block pointing to `pageId` (`null` = not yet created). */
      insertSubpage: (pageId: string | null) => ReturnType;
    };
  }
  interface Storage {
    subpage: SubpageStorage;
  }
}

export interface SubpageStorage {
  /** The page creator, installed by the editor during editing (MIN-272). Read at the moment
      of the click, not captured: it arrives after editing the editor. */
  create: (() => Promise<string | null>) | null;
  /** The pages that have just lost their block in this document. Same party
      taken as `create`: read at the time of the event, never captured. */
  removed: ((pageIds: string[]) => void) | null;
  /** The page which has just been created from the “/” menu and whose block is
      asked: the caller to save the parent, then open it. */
  opened: ((pageId: string) => void) | null;
  /** Copy a page and its descendants, and return the id of the copy. This is what
      that “duplicate” does on a subpage block — copying the BLOCK would give
      two links to the same page, which no one asks for. */
  duplicate: ((pageId: string) => Promise<string | null>) | null;
  markdown?: unknown;
}

/**
 * Pages cited by a ProseMirror document.
 *
 * On the node rather than on its JSON: `descendants` traverses the tree without
 * serialize nothing, and this read runs on EVERY keystroke. It is recursive
 * because a sub-page block can be placed in a leaflet or an item of
 * list — looking only at the first level would leave a block pointing to the
 * empty, exactly what we are trying to prevent.
 */
export function subpageIdsInDoc(doc: ProseMirrorNode): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node) => {
    if (node.type.name !== "subpage") return true;
    const id = node.attrs.pageId;
    if (typeof id === "string" && id.length > 0) ids.add(id);
    return false;
  });
  return ids;
}

const SUBPAGE_MD = /^\[\[page:([^\]\s]+)\]\]$/;

export const Subpage = Node.create<Record<string, never>, SubpageStorage>({
  name: "subpage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addStorage() {
    return { create: null, removed: null, opened: null, duplicate: null };
  },

  /**
   * `onUpdate` and not `onTransaction`, and the difference is all but one
   * detail: adopting a merged document requires `setContent(…, { emitUpdate:
   * false })` (MIN-271), qui pose `preventUpdate` on its transaction. On
   * `onTransaction`, a merge that dropped a subpage block — what the
   * fusion does precisely when the SERVER has just removed it — would read as
   * a deletion of the user, and would trash the page a second time.
   *
   * The comparison is made on `transaction.before` rather than on a snapshot
   * kept aside: a snapshot expires precisely at these adoptions
   * silent, while the transaction always carries its own forward.
   */
  onUpdate({ editor, transaction }) {
    const removed = this.storage.removed;
    if (!removed || !transaction.docChanged) return;

    const before = subpageIdsInDoc(transaction.before);
    if (before.size === 0) return;
    const after = subpageIdsInDoc(editor.state.doc);
    const gone = [...before].filter((id) => !after.has(id));
    if (gone.length > 0) removed(gone);
  },

  addAttributes() {
    return { pageId: { default: null } };
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-type="subpage"]',
        getAttrs: (element) => ({
          pageId: (element as HTMLElement).getAttribute("data-page-id"),
        }),
      },
    ];
  },

  renderHTML({ node }) {
    return [
      "div",
      { "data-type": "subpage", "data-page-id": node.attrs.pageId ?? "" },
    ];
  },

  // No `addNodeView` here, and that's the rule of the file: the view
  // (blocks/subpage-view.tsx) is a “use client” module and `@tiptap/react`
  // is one too. Naming it from this file would enter a reference
  // client in the SERVER graph — the register is mounted by the projection
  // markdown (lib/pages-markdown.ts), therefore by the MCP, Numo and the agent — and
  // tiptap would call it when mounting the headless editor. The view is injected
  // by the surface, `pageExtensions({ nodeViews: { subpage } })`, exactly
  // like the notebook task (see task-list.ts).

  addCommands() {
    return {
      insertSubpage:
        (pageId: string | null) =>
        ({ commands }) =>
          commands.insertContent({ type: "subpage", attrs: { pageId } }),
    };
  },
});

export const subpageBlock: PageBlock = {
  id: "subpage",
  nodeName: "subpage",
  extensions: [Subpage],
  icon: FileText,
  labelKey: "blockSubpage",
  slash: {
    group: "advanced",
    order: 5,
    keywords: ["page", "subpage", "sous-page", "sous page", "child", "enfant", "wiki"],
  },
  // A subpage does not “transform” from a paragraph: there is nothing
  // to convert, it POINTS to another document.
  turnInto: false,
  insert: (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    const create = editor.storage.subpage?.create;
    if (!create) {
      // Without a wired creator, we still place the block: visible, selectable,
      // deleteable. An empty block can be seen and corrected; a menu entry that
      // did nothing leaves the user thinking they typed wrong.
      editor.commands.insertSubpage(null);
      return;
    }
    // `create` creates the page AND opens the child, in this order: the block must
    // be ASKED, then the body of the registered parent, before leaving the page
    // — otherwise the navigation disassembles the editor with, in the draft, a block
    // that no one has written yet. Waiting and recording lives at home
    // l'appelant (`PagesLookup.opened`), qui seul tient l'autosave.
    void create().then((pageId) => {
      if (editor.isDestroyed) return;
      editor.commands.insertSubpage(pageId);
      if (pageId) editor.storage.subpage?.opened?.(pageId);
    });
  },
  isActive: (editor) => editor.isActive("subpage"),
  markdown: {
    // A subpage is projected as `[[page:<id>]]`: one line, readable, and
    // Numo can WRITE (it knows the ids from MCP tools). The reading sense
    // requires its own rule — markdown-it doesn't know this syntax.
    sample: "[[page:00000000-0000-4000-8000-000000000000]]",
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      state.write(`[[page:${node.attrs.pageId ?? ""}]]`);
      state.closeBlock(node);
    },
    fromMarkdown: (markdownit) => subpageMarkdownIt(markdownit as MarkdownIt),
  },
};

/* ── The markdown-it rule (reading direction) ──────────────────────────────── */

// Minimal form of markdown-it pieces that we touch — same bias as
// components/scratchpad/task-markdown.ts: the package is a dependency
// transitive de tiptap-markdown, on ne s'y accroche pas par ses types.
interface MdToken {
  type: string;
  content: string;
  block: boolean;
}
interface MdCoreState {
  tokens: MdToken[];
  Token: new (type: string, tag: string, nesting: number) => MdToken;
}
interface MarkdownIt {
  core: {
    ruler: {
      after(after: string, name: string, fn: (state: MdCoreState) => void): void;
    };
  };
}

/**
 * A paragraph that ONLY contains `[[page:<id>]]` becomes the HTML as the node
 * knows how to reread. We use a `html_block` rather than a house token: the
 * reading path of tiptap-markdown is markdown-it → HTML → `parseHTML`, and
 * This is what `parseHTML` of the node above already does.
 *
 * Hence the `html: true` on the Markdown page editor extension: without it,
 * markdown-it would escape this block into text.
 */
function subpageMarkdownIt(md: MarkdownIt): void {
  md.core.ruler.after("inline", "minddy-subpage", (state) => {
    const tokens = state.tokens;
    for (let i = tokens.length - 2; i >= 1; i--) {
      if (
        tokens[i].type !== "inline" ||
        tokens[i - 1].type !== "paragraph_open" ||
        tokens[i + 1].type !== "paragraph_close"
      ) {
        continue;
      }
      const match = SUBPAGE_MD.exec(tokens[i].content.trim());
      if (!match) continue;
      const token = new state.Token("html_block", "", 0);
      // Escaped: `[[page:a"b]]` is perfectly writeable markdown, and
      // copied naked it closes the attribute that we manufacture (MIN-350).
      token.content =
        `<div data-type="subpage" data-page-id="${escapeHtmlAttribute(match[1])}"></div>\n`;
      token.block = true;
      tokens.splice(i - 1, 3, token);
    }
  });
}
