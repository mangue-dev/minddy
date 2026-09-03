import { mergeAttributes } from "@tiptap/core";
import { Link, isAllowedUri } from "@tiptap/extension-link";
import { TextSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import {
  MARKDOWN_LINK_CLASS,
  markdownLinkPresentation,
} from "@/lib/markdown-link";

/** Select a regular Markdown link on a plain click so its action menu can open. */
export function handleMarkdownLinkClick(
  view: EditorView,
  pos: number,
  event: MouseEvent,
): boolean {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return false;
  }

  const target = event.target as Element | null;
  const link = target?.closest?.(`a.${MARKDOWN_LINK_CLASS}`);
  if (!link || !view.dom.contains(link)) return false;

  event.preventDefault();
  const textNode = Array.from(link.childNodes).find(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent,
  );
  const clickPos = textNode ? view.posAtDOM(textNode, 1) : pos;
  const resolvedPos = Math.max(
    0,
    Math.min(clickPos, view.state.doc.content.size),
  );
  view.dispatch(
    view.state.tr.setSelection(
      TextSelection.create(view.state.doc, resolvedPos),
    ),
  );
  view.focus();
  return true;
}

/** TipTap's regular link mark with the shared Markdown-link presentation. */
export const MarkdownLinkMark = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const allowed = this.options.isAllowedUri(HTMLAttributes.href, {
      defaultValidate: (href) => !!isAllowedUri(href, this.options.protocols),
      protocols: this.options.protocols,
      defaultProtocol: this.options.defaultProtocol,
    });
    const attributes = allowed ? HTMLAttributes : { ...HTMLAttributes, href: "" };

    return [
      "a",
      mergeAttributes(
        this.options.HTMLAttributes,
        attributes,
        markdownLinkPresentation(allowed ? HTMLAttributes.href : undefined),
      ),
      0,
    ];
  },
}).configure({ openOnClick: false });
