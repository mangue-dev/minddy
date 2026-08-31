import { Node } from "@tiptap/core";
import { Paperclip } from "lucide-react";
import { normalizePageFileSrc, pageFileIdFromSrc } from "@/lib/page-files";
import {
  escapeHtmlAttribute,
  markdownLinkDestination,
} from "@/components/pages/blocks/escape";
import type { PageFilePickStorage } from "@/components/pages/blocks/image";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * The FILE block (MIN-280) — any type, placed inline in the
 * document with its name, its weight and its download.
 *
 * Its markdown projection is a LINK: `[rapport.pdf](/api/…)`. It is the only
 * form that markdown offers, and it has the good taste of being exactly what an
 * agent knows how to write without learning anything.
 *
 * The READING direction, on the other hand, requires its own rule, and we must see why
 *: a paragraph which contains only one link is a construction ordinary (a
 * “see also” line), and treating it as a bulk file would mutate text that
 * no one wrote as such. The rule below therefore ONLY takes links
 * that point to a page file — the others remain paragraphs,
 * intact. A `[rapport.pdf](https://exemple.org/…)` written by Numo remains a
 * text link: it is one.
 *
 * `size` and `mime` do not survive markdown (nothing takes them there), and it's
 * written with the other losses assumed, at the head of lib/pages-markdown.ts. They
 * are not content: the view reads them back from the server if one day it needs them, and without them the line already says the name and gives the file.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageFile: {
      /** Place a file block. Without `src`, it is a location waiting for
 to be uploaded (`uploadId`). */
      insertPageFile: (attrs: {
        src?: string | null;
        name?: string | null;
        size?: number | null;
        mime?: string | null;
        uploadId?: string | null;
      }) => ReturnType;
    };
  }
  interface Storage {
    pageFile: PageFilePickStorage;
  }
}

export const PageFile = Node.create({
  name: "pageFile",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: {
        default: null,
        // Normalized like that of the image block: a markdown link written with a
        // origine (`[x](http://localhost:3000/api/…)`) entre par ici.
        parseHTML: (element) => normalizePageFileSrc(element.getAttribute("data-src")),
        renderHTML: (attributes) =>
          attributes.src ? { "data-src": attributes.src as string } : {},
      },
      name: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-name"),
        renderHTML: (attributes) =>
          attributes.name ? { "data-name": attributes.name as string } : {},
      },
      size: {
        default: null,
        parseHTML: (element) => {
          const raw = Number(element.getAttribute("data-size"));
          return Number.isFinite(raw) && raw > 0 ? raw : null;
        },
        renderHTML: (attributes) =>
          attributes.size ? { "data-size": String(attributes.size) } : {},
      },
      mime: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-mime"),
        renderHTML: (attributes) =>
          attributes.mime ? { "data-mime": attributes.mime as string } : {},
      },
      /** Out of document — cf. the same attribute on the image block. */
      uploadId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    // A `div` and not a `p`: the paragraph rule would catch the tag and
    // would throw away the attributes in passing (see blocks/types.ts).
    return [{ tag: 'div[data-type="pageFile"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", { ...HTMLAttributes, "data-type": "pageFile" }];
  },

  /** See `storage.image.pick`: the file selector comes from the surface. */
  addStorage() {
    return { pick: null };
  },

  addCommands() {
    return {
      insertPageFile:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "pageFile", attrs }),
    };
  },
});

export const fileBlock: PageBlock = {
  id: "file",
  nodeName: "pageFile",
  extensions: [PageFile],
  icon: Paperclip,
  labelKey: "blockFile",
  slash: {
    group: "advanced",
    order: 7,
    keywords: [
      "file",
      "fichier",
      "attachment",
      "pièce jointe",
      "piece jointe",
      "upload",
      "pdf",
      "document",
    ],
  },
  turnInto: false,
  // Cf. blocks/image.ts: `turnInto: false` requires you to carry your `insert`.
  // `accept` empty — any type, that's the whole point of the block.
  insert: (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    editor.storage.pageFile?.pick?.("");
  },
  isActive: (editor) => editor.isActive("pageFile"),
  markdown: {
    sample: "[report.pdf](/api/projects/00000000-0000-4000-8000-000000000000/pages/files/22222222-2222-4222-8222-222222222222)",
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      // The address is ESCAPED, and an address with a refused protocol writes nothing
      // at all (MIN-350): this link is clickable wherever the markdown is
      // rendered, and `[nom](javascript:…)` is one.
      const src = markdownLinkDestination(node.attrs.src);
      if (!src) return;
      const name =
        (typeof node.attrs.name === "string" && node.attrs.name.trim()) || "file";
      state.write(`[${state.esc(name)}](${src})`);
      state.closeBlock(node);
    },
    fromMarkdown: (markdownit) => fileMarkdownIt(markdownit as MarkdownIt),
  },
};

/* ── The markdown-it rule (reading direction) ─────────────────────────────── */

// Minimal form of markdown-it pieces that we touch — same bias as
// blocks/subpage.ts: the package is a transitive dependency of
// tiptap-markdown, so we do not depend on its types.
interface MdToken {
  type: string;
  content: string;
  block: boolean;
  children?: MdToken[] | null;
  attrGet?(name: string): string | null;
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
 * A paragraph that ONLY contains the link to a page file becomes the HTML
 * that the node knows how to reread. As for the subpage, we go through a `html_block`
 *: the reading path of tiptap-markdown is markdown-it → HTML → `parseHTML`.
 */
function fileMarkdownIt(md: MarkdownIt): void {
  md.core.ruler.after("inline", "minddy-page-file", (state) => {
    const tokens = state.tokens;
    for (let i = tokens.length - 2; i >= 1; i--) {
      if (
        tokens[i].type !== "inline" ||
        tokens[i - 1].type !== "paragraph_open" ||
        tokens[i + 1].type !== "paragraph_close"
      ) {
        continue;
      }
      const children = tokens[i].children;
      // Exactly `[texte](url)`, and nothing around: three tokens, not one
      // more. A link in the middle of a sentence remains a text link.
      if (!children || children.length !== 3) continue;
      const [open, text, close] = children;
      if (
        open.type !== "link_open" ||
        text.type !== "text" ||
        close.type !== "link_close"
      ) {
        continue;
      }
      const href = open.attrGet?.("href") ?? null;
      if (!pageFileIdFromSrc(href)) continue;

      const token = new state.Token("html_block", "", 0);
      token.content =
        `<div data-type="pageFile" data-src="${escapeHtmlAttribute(href as string)}" ` +
        `data-name="${escapeHtmlAttribute(text.content)}"></div>\n`;
      token.block = true;
      tokens.splice(i - 1, 3, token);
    }
  });
}
