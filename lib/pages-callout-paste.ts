import type { Editor } from "@tiptap/core";
import { normalizeNotionCalloutPaste } from "@/components/pages/blocks/callout";
import { bodyFromMarkdown } from "@/lib/pages-markdown";

/**
 * Prefer the plain-text Notion representation over rich clipboard HTML.
 *
 * A browser often puts both on the clipboard. ProseMirror normally chooses the
 * HTML flavor first, but when `<aside>` was displayed as code that flavor only
 * contains escaped literal tags. The plain-text flavor is the one that still
 * carries Notion's callout grammar, so this narrowly recognized paste takes
 * ownership before the default HTML path.
 */
export function insertNotionCalloutPaste(
  editor: Editor,
  clipboardText: string
): boolean {
  const markdown = normalizeNotionCalloutPaste(clipboardText);
  if (!markdown) return false;
  const blocks = bodyFromMarkdown(markdown).content;
  if (!blocks?.length) return false;
  return editor.chain().focus().insertContent(blocks).run();
}
