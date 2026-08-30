import {
  Details,
  DetailsContent,
  DetailsSummary,
} from "@tiptap/extension-details";
import { ChevronRight } from "lucide-react";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

/**
 * The leaflet — one block, THREE nodes (`details` > `detailsSummary` +
 * `detailsContent`). This is the case which justifies that serialization can live
 * in the block file rather than on the descriptor: the register only knows how to
 * graft a `toMarkdown` on the named node, and three are needed here. The
 * descriptor therefore only declares its `sample`, and it is he who holds the
 * contract — it passes through a real editor in lib/pages-blocks.test.ts.
 *
 * **Markdown has no leaflet.** No syntax, nor CommonMark nor GFM. The
 * only collapsible that GitHub, Notion and Obsidian all three render is the
 * `<details>` HTML — so that's the projection, and that's what Numo will read.
 * (Hence `html: true` on the editor's Markdown extension page.)
 */

const detailsMarkdown = {
  serialize(state: MarkdownState, node: MarkdownNode) {
    state.write("<details>\n");
    state.renderContent(node);
    state.write("</details>");
    state.closeBlock(node);
  },
  parse: {},
};

/**
 * The summary is written IN a tag — and what we put there is already ESCAPED, without a line in this file taking care of it (checked in MIN-350, and written here because reading the code says exactly the opposite).
 *
 * It's tiptap-markdown that does it, on ANY text node in the document and not
 * only here: its text serializer goes through `escapeHTML`
 * (`tiptap-markdown/src/extensions/nodes/text.js`), which replaces `<` and `>` by
 * their entities. A summary “A <b> x” therefore comes out as `A &lt;b&gt; x`, and the
 * reading re-decodes it into text — the tag does not close, the round trip
 * returns identical, and `lib/pages-markdown.test.ts` holds it.
 *
 * The remaining assumed loss, tiny and from the same family as the others:
 * a summary whose text is literally `&lt;` returns to `<`. Nothing
 * distinguishes the two in the projection, here any more than elsewhere — it's the
 * price of `html: true`, which is the price of the leaflet.
 */
const summaryMarkdown = {
  serialize(state: MarkdownState, node: MarkdownNode) {
    state.write("<summary>");
    state.renderInline(node);
    state.write("</summary>");
    state.closeBlock(node);
  },
  parse: {},
};

const contentMarkdown = {
  // The body is written naked: what is folded remains ordinary markdown, so
  // readable and modifiable by Numo without knowing the leaflet.
  serialize(state: MarkdownState, node: MarkdownNode) {
    state.renderContent(node);
  },
  parse: {},
};

/**
 * The two labels of the fallback button, set by the editor during mounting.
 *
 * The block register has no translator — it is mounted headless by the
 * markdown projection and by the MCP tools, where neither label makes sense. The
 * default values ​​are therefore only there for these surfaces; as soon as a
 * browser is in play, components/pages/page-editor.tsx calls
 * `setDetailsLabels` with the catalog strings.
 */
const labels = { expand: "Expand", collapse: "Collapse" };

export function setDetailsLabels(next: {
  expand: string;
  collapse: string;
}): void {
  labels.expand = next.expand;
  labels.collapse = next.collapse;
}

/** The chevron of the button, in inline SVG — same layout as `ChevronRight`. */
const CHEVRON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>';

/** Stable hook for removing the browser's native summary marker. */
export const DETAILS_SUMMARY_CLASS = "page-details-summary";

const PageDetails = Details.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: detailsMarkdown };
  },
}).configure({
  /**
 * `persist`: the folded/unfolded state enters the DOCUMENT.
 *
 * Without it, tiptap only keeps the opening in the CSS class of the node view —
 * the whole page therefore reopens folded on reload, including the leaflets
 * that we had just opened. A leaflet is an editorial choice ("this is
 * secondary"), not a display state: it fits with the text.
 */
  persist: true,
  /**
 * The button that tiptap renders is EMPTY — no icon, no dimension, no
 * style. Left as is, the leaflet has nothing clickable on the screen: on
 * sees two stacked paragraphs, one of which sometimes disappears. This is where we
 * gives it its chevron, and in app/globals.css it takes its place.
 */
  renderToggleButton: ({ element, isOpen }: { element: HTMLElement; isOpen: boolean }) => {
    element.className = "page-details-toggle";
    element.setAttribute("aria-expanded", String(isOpen));
    element.setAttribute("aria-label", isOpen ? labels.collapse : labels.expand);
    element.setAttribute("title", isOpen ? labels.collapse : labels.expand);
    if (!element.firstChild) element.innerHTML = CHEVRON;
  },
});

const PageDetailsSummary = DetailsSummary.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: summaryMarkdown };
  },
}).configure({
  HTMLAttributes: { class: DETAILS_SUMMARY_CLASS },
});

const PageDetailsContent = DetailsContent.extend({
  addStorage() {
    return { ...this.parent?.(), markdown: contentMarkdown };
  },
});

export const detailsBlock: PageBlock = {
  id: "details",
  nodeName: "details",
  extensions: [PageDetails, PageDetailsSummary, PageDetailsContent],
  icon: ChevronRight,
  labelKey: "blockDetails",
  slash: {
    group: "advanced",
    order: 4,
    keywords: ["details", "dépliant", "depliant", "toggle", "collapse", "accordion", "fold"],
  },
  turnInto: (editor) => editor.chain().focus().setDetails().run(),
  isActive: (editor) => editor.isActive("details"),
  shortcut: { keys: "Mod-Alt-D", display: "⌘⌥D" },
  markdown: {
    sample: "<details>\n<summary>A summary</summary>\n\nHidden text\n\n</details>",
  },
};
