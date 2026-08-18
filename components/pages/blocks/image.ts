import { Node } from "@tiptap/core";
import { ImageIcon } from "lucide-react";
import { normalizePageFileSrc } from "@/lib/page-files";
import { markdownLinkDestination } from "@/components/pages/blocks/escape";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * The IMAGE block (MIN-280) — an atomic BLOCK node, which carries only one
 * address, alt text and width.
 *
 * Three decisions are worth writing down, because none is obvious at first glance.
 * relecture :
 *
 * **1. A block, not an inline image.** Markdown only has the inline image.
 * line (`![…](…)` lives in a paragraph). This is not a contradiction: the
 * node is declared `group: "block"`, and the ProseMirror DOM parser, when it
 * encounters a `<img>` in a `<p>`, closes the paragraph and places the block — the
 * text which preceded and which follows remain two paragraphs. Nothing is
 * lost, and an image stuck in the middle of a sentence by Numo therefore dates back to his
 * own line. This is the behavior we want: in a page, a capture
 * screen is a block that is moved, not a letter of the paragraph.
 *
 * **2. `src` carries the URL of the ROUTE, never the bucket path or a URL
 * signed** (the full reason is in lib/page-files.ts). An image of which
 * the `src` is an EXTERNAL URL is a perfectly normal case — Numo writes
 * `![graphe](https://…)`, and it works: this block nowhere assumes that the
 * file is ours.
 *
 * **3. WIDTH is a percentage of the column, not the pixels.** One page
 * can be read on a laptop screen like a 27-inch one; an image posed to
 * 640 px overflows from one and floats in the middle of the other. The percentage is
 * in both, and it is also the only adjustment that remains just when the column
 * de texte change de largeur.
 *
 * `uploadId` is the exception which confirms the rest: the only attribute which has no
 * meaning only here and now. It takes the time to upload — the view reads it
 * to display the local preview and progress (components/pages/blocks/image-view.tsx),
 * and it falls back to `null` as soon as the definitive `src` arrives.
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pageImage: {
      /** Place an image block. Without `src`, it is a location waiting for
          its upload (`uploadId`). */
      insertPageImage: (attrs: {
        src?: string | null;
        alt?: string | null;
        width?: number | null;
        uploadId?: string | null;
      }) => ReturnType;
    };
  }
  interface Storage {
    image: PageFilePickStorage;
  }
}

/** What the SURFACE places on the two file blocks: enough to open a
    dialog box. Read at the moment of the gesture and never captured, like the
    subpage brackets — the register is mounted headless by projection
    markdown, where no file selector makes sense. */
export interface PageFilePickStorage {
  /** `accept` of a `<input type="file">` (`"image/*"`, or empty for all). */
  pick: ((accept: string) => void) | null;
  markdown?: unknown;
}

/** Width bounds, as a percentage of the text column. Below 10%
    an image is nothing more than a point; beyond 100% it would overflow. */
export const IMAGE_MIN_WIDTH = 10;
export const IMAGE_MAX_WIDTH = 100;

/** The width as we agree to store it: a bounded integer, or `null`
    (“full column”, the absence of adjustment rather than a 100 written everywhere). */
export function clampImageWidth(value: unknown): number | null {
  const width = typeof value === "string" ? Number(value) : value;
  if (typeof width !== "number" || !Number.isFinite(width)) return null;
  const rounded = Math.round(width);
  if (rounded >= IMAGE_MAX_WIDTH) return null;
  return Math.max(IMAGE_MIN_WIDTH, rounded);
}

export const PageImage = Node.create({
  name: "image",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      // The `src` is RENORMALISED when reading, and this is what prevents a
      // image of disappearing from a document that is reopened elsewhere.
      //
      // Copying an image block does not copy the document: the clipboard
      // carries HTML, and Chrome rewrites `/api/…` to `http://localhost:3000/api/…`.
      // Pasted, the block stores this address - visible on the post which has
      // stuck, dead everywhere else, and invisible to scanning
      // orphans, which ends up deleting the file it named. A case
      // lived (MIN-284): the file block, whose address travels to `data-src`
      // that the browser does not touch, never had anything.
      src: {
        default: null,
        parseHTML: (element) => normalizePageFileSrc(element.getAttribute("src")),
      },
      // The LEGEND, and the alternative text: a single field, because markdown
      // only has one (`![caption](…)`) and having two in the node would have
      // meant losing one each time there and back. A good caption is a
      // good alternative text — it is even the only usable definition of
      // deux.
      alt: { default: null },
      width: {
        default: null,
        parseHTML: (element) => clampImageWidth(element.getAttribute("data-width")),
        renderHTML: (attributes) =>
          attributes.width ? { "data-width": String(attributes.width) } : {},
      },
      // Hors document : jamais rendu en HTML, donc jamais relu. Un
      // upload does not survive page reload, and this is very
      // well — what survives is what has a `src`.
      uploadId: { default: null, rendered: false },
    };
  },

  parseHTML() {
    return [{ tag: "img[src]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", HTMLAttributes];
  },

  /** The file selector, placed by the surface during assembly — same assembly as
      `storage.subpage.create`: the register is headless, and open a box
      dialog only makes sense in a browser. */
  addStorage() {
    return { pick: null };
  },

  addCommands() {
    return {
      insertPageImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "image", attrs }),
    };
  },
});

export const imageBlock: PageBlock = {
  id: "image",
  nodeName: "image",
  extensions: [PageImage],
  icon: ImageIcon,
  labelKey: "blockImage",
  slash: {
    group: "advanced",
    order: 5,
    keywords: [
      "image",
      "img",
      "photo",
      "picture",
      "capture",
      "screenshot",
      "capture d'écran",
      "illustration",
    ],
  },
  // An image does not “transform” from a paragraph: there is no
  // text to convert to file. It is inserted, like the subpage.
  turnInto: false,
  // And like the subpage, it MUST therefore carry its `insert`: without it, the
  // register falls back to "clear range, then convert", and an entry of
  // menu whose `turnInto` is `false` would only have swallowed the “/image”.
  // The selector comes from the surface (`storage.image.pick`); without him — a
  // read-only editor, preview of a version — entry does nothing,
  // but it is not offered there either.
  insert: (editor, range) => {
    editor.chain().focus().deleteRange(range).run();
    editor.storage.image?.pick?.("image/*");
  },
  isActive: (editor) => editor.isActive("image"),
  markdown: {
    sample: "![A screenshot](/api/projects/00000000-0000-4000-8000-000000000000/pages/files/11111111-1111-4111-8111-111111111111)",
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      // Escaped, and refused with its protocol — cf. blocks/file.ts (MIN-350).
      const src = markdownLinkDestination(node.attrs.src);
      const alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
      // A location that failed to upload writes NOTHING instead
      // than an empty `![](…)`: the markdown is what Numo reads, and an image without
      // address is neither content nor information.
      if (!src) return;
      state.write(`![${state.esc(alt)}](${src})`);
      state.closeBlock(node);
    },
  },
};
