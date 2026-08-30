import { mergeAttributes, Node, type Editor } from "@tiptap/core";
import { Lightbulb } from "lucide-react";
import {
  PAGE_COLORS,
  type PageColor,
} from "@/components/pages/blocks/color";
import { escapeHtmlAttribute } from "@/components/pages/blocks/escape";
import type {
  MarkdownNode,
  MarkdownState,
  PageBlock,
} from "@/components/pages/blocks/types";

export const CALLOUT_DEFAULT_ICON = "💡";
export const CALLOUT_COLOR_ATTRIBUTE = "data-page-callout-color";
export const CALLOUT_ICON_ATTRIBUTE = "data-page-callout-icon";

const EMOJI =
  /^(?:\p{RI}\p{RI}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?)*)$/u;

/**
 * Normalize the compact plain-text form copied by Notion.
 *
 * Depending on the source surface, the tag may be escaped (`\<aside>`) and
 * followed by a Markdown hard-break backslash. Without a blank after the icon,
 * markdown-it treats the entire block as raw HTML: the tags and `**bold**`
 * reach the editor as literal text. We only claim a clipboard made entirely of
 * bare aside blocks, then turn each one into Markdown that the normal page
 * parser can understand.
 */
export function normalizeNotionCalloutPaste(text: string): string | null {
  const source = text.replace(/\r\n?/g, "\n");
  const blocks: string[] = [];
  let current: string[] | null = null;

  const comparable = (line: string) =>
    line
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .trim();
  const opening = /^\\*<aside>\\*$/i;
  const closing = /^\\*(?:<\/aside>|<aside\s*\/>)\\*$/i;

  for (const line of source.split("\n")) {
    const marker = comparable(line);
    if (current === null) {
      if (!marker) continue;
      if (!opening.test(marker)) return null;
      current = [];
      continue;
    }
    if (closing.test(marker)) {
      const lines = current;
      current = null;
      while (lines[0]?.trim() === "") lines.shift();
      while (lines.at(-1)?.trim() === "") lines.pop();
      const first = lines[0]?.trim() ?? "";
      const icon = EMOJI.test(first) ? lines.shift()!.trim() : null;
      const separated: string[] = [];
      for (const contentLine of lines) {
        if (
          contentLine.trim() &&
          separated.length > 0 &&
          separated.at(-1)?.trim()
        ) {
          // Notion emits one content block per line in this compact flavor.
          separated.push("");
        }
        separated.push(contentLine);
      }
      const body = separated.join("\n").trim();
      blocks.push(
        [
          "<aside>",
          ...(icon ? [icon] : []),
          "",
          body,
          "",
          "</aside>",
        ].join("\n")
      );
      continue;
    }
    current.push(line);
  }

  if (current !== null || blocks.length === 0) return null;
  return blocks.join("\n\n");
}

function pageColor(value: unknown): PageColor | null {
  return typeof value === "string" && PAGE_COLORS.includes(value as PageColor)
    ? (value as PageColor)
    : null;
}

function calloutIcon(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Give an uncolored callout a useful Notion-like tint without persisting a
 * presentation choice. An explicit palette color always takes precedence, so
 * changing the icon only recolors callouts that are still in automatic mode.
 */
export function automaticCalloutColor(icon: unknown): PageColor {
  const normalized = calloutIcon(icon)?.replaceAll("\uFE0F", "") ?? "";
  if (/^(?:✅|✔|☑|🟢|👍|🌱|♻)$/.test(normalized)) return "green";
  if (/^(?:❌|⛔|🚫|🛑|❗|‼|🔴)$/.test(normalized)) return "red";
  if (/^(?:🔥|🟠)$/.test(normalized)) return "orange";
  if (/^(?:💡|⚠|⭐|🌟|🔔|🟡)$/.test(normalized)) return "amber";
  if (/^(?:ℹ|💬|📘|🔵|💧)$/.test(normalized)) return "blue";
  if (/^(?:💜|🟣|✨|🔮)$/.test(normalized)) return "violet";
  return "gray";
}

/**
 * Notion's plain-text copy format writes a bare `<aside>` and puts its icon on
 * the first line. Markdown-it leaves that line as a direct text node; HTML
 * clipboard variants may wrap it in a paragraph. Both forms mean the same
 * thing, but only when the first meaningful child contains exactly one emoji.
 */
function leadingNotionIcon(element: HTMLElement): {
  icon: string;
  childIndex: number;
} | null {
  const children = Array.from(element.childNodes);
  for (let childIndex = 0; childIndex < children.length; childIndex += 1) {
    const child = children[childIndex];
    const value = child.textContent?.trim() ?? "";
    if (!value) continue;
    const paragraphOrText =
      child.nodeType === 3 ||
      (child instanceof HTMLElement && child.tagName === "P");
    return paragraphOrText && EMOJI.test(value)
      ? { icon: value, childIndex }
      : null;
  }
  return null;
}

function calloutContentElement(element: HTMLElement): HTMLElement {
  const rendered = element.querySelector<HTMLElement>("[data-callout-content]");
  if (rendered) return rendered;

  // An explicit attribute is authoritative, including the empty value that
  // means the author intentionally removed the icon.
  if (element.hasAttribute(CALLOUT_ICON_ATTRIBUTE)) return element;
  const leading = leadingNotionIcon(element);
  if (!leading) return element;

  const content = element.cloneNode(true) as HTMLElement;
  content.childNodes[leading.childIndex]?.remove();
  return content;
}

/**
 * A Notion-style callout: a semantic aside whose icon and palette color belong
 * to the block, while its body remains ordinary editable page content.
 *
 * The wrapper uses `block+` rather than inline content so a callout can hold
 * paragraphs, lists, tasks, and other rich blocks. The dedicated content
 * element keeps the decorative icon outside ProseMirror's editable subtree.
 */
export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      icon: {
        default: CALLOUT_DEFAULT_ICON,
        parseHTML: (element: HTMLElement) =>
          element.hasAttribute(CALLOUT_ICON_ATTRIBUTE)
            ? (element.getAttribute(CALLOUT_ICON_ATTRIBUTE) ?? "")
            : (leadingNotionIcon(element)?.icon ?? CALLOUT_DEFAULT_ICON),
        renderHTML: (attributes: { icon?: unknown }) => {
          const icon = calloutIcon(attributes.icon);
          return { [CALLOUT_ICON_ATTRIBUTE]: icon ?? "" };
        },
      },
      color: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          pageColor(element.getAttribute(CALLOUT_COLOR_ATTRIBUTE)),
        renderHTML: (attributes: { color?: unknown }) => {
          const color = pageColor(attributes.color);
          return color ? { [CALLOUT_COLOR_ATTRIBUTE]: color } : {};
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        // Bare `<aside>` is the format Notion places on the plain-text
        // clipboard. Our enriched form uses the same semantic tag plus attrs.
        tag: "aside",
        // Exported Markdown keeps its body directly inside `<aside>`, while
        // rendered editor HTML wraps it to keep the icon out of the content.
        contentElement: calloutContentElement,
      },
    ];
  },

  renderHTML({ node, HTMLAttributes }) {
    const icon = calloutIcon(node.attrs.icon);
    const color = pageColor(node.attrs.color) ?? automaticCalloutColor(icon);
    const content = [
      "div",
      { "data-callout-content": "", class: "page-callout-content" },
      0,
    ];
    return [
      "aside",
      mergeAttributes(HTMLAttributes, {
        "data-type": "callout",
        [CALLOUT_COLOR_ATTRIBUTE]: color,
        class: "page-callout",
      }),
      ...(icon
        ? [
            [
              "span",
              { class: "page-callout-icon", "aria-hidden": "true" },
              icon,
            ],
          ]
        : []),
      content,
    ];
  },
});

/** `undefined` means the current selection is not inside a callout. */
export function activeCalloutColor(
  editor: Editor
): PageColor | null | undefined {
  if (!editor.isActive("callout")) return undefined;
  return pageColor(editor.getAttributes("callout").color);
}

/** Update the enclosing callout without coloring its individual text runs. */
export function setCalloutColor(
  editor: Editor,
  color: PageColor | null
): boolean {
  if (!editor.isActive("callout")) return false;
  return editor
    .chain()
    .focus()
    .updateAttributes("callout", { color: pageColor(color) })
    .run();
}

export const calloutBlock: PageBlock = {
  id: "callout",
  nodeName: "callout",
  extensions: [Callout],
  icon: Lightbulb,
  labelKey: "blockCallout",
  slash: {
    group: "advanced",
    order: 1,
    keywords: [
      "callout",
      "aside",
      "note",
      "panel",
      "encadré",
      "encadre",
      "info",
      "warning",
    ],
  },
  turnInto: (editor) =>
    editor
      .chain()
      .focus()
      .toggleWrap("callout", { icon: CALLOUT_DEFAULT_ICON, color: null })
      .run(),
  isActive: (editor) => editor.isActive("callout"),
  shortcut: { keys: "Mod-Alt-A", display: "⌘⌥A" },
  markdown: {
    sample:
      '<aside data-type="callout" data-page-callout-color="blue" data-page-callout-icon="💡">\n\nA useful note\n\n</aside>',
    toMarkdown: (state: MarkdownState, node: MarkdownNode) => {
      const icon = calloutIcon(node.attrs.icon);
      const color = pageColor(node.attrs.color);
      const attributes = [
        'data-type="callout"',
        ...(color
          ? [`${CALLOUT_COLOR_ATTRIBUTE}="${escapeHtmlAttribute(color)}"`]
          : []),
        `${CALLOUT_ICON_ATTRIBUTE}="${escapeHtmlAttribute(icon ?? "")}"`,
      ].join(" ");
      state.write(`<aside ${attributes}>\n\n`);
      state.renderContent(node);
      state.write("</aside>");
      state.closeBlock(node);
    },
  },
};
