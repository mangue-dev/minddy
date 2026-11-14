import type { Editor } from "@tiptap/core";

/**
 * Writes a dictation taken from the mobile keyboard toolbar (MIN-984) where
 * the caret was when the take started. The text is Markdown (the
 * `editor_markdown` cleanup context): tiptap-markdown parses it, so a dictated
 * list, heading or checklist lands as real blocks.
 *
 * - On an empty top-level line the blocks replace that line, so a dictated
 *   list does not leave an empty paragraph above it.
 * - A single line dictated right after a word gets a space before it.
 */
export function insertDictatedMarkdown(editor: Editor, at: number, markdown: string): boolean {
  const text = markdown.trim();
  if (!text || editor.isDestroyed) return false;
  const { doc } = editor.state;
  const pos = Math.max(0, Math.min(at, doc.content.size));
  const $pos = doc.resolve(pos);
  const parent = $pos.parent;

  if (parent.isTextblock && parent.content.size === 0 && $pos.depth === 1) {
    return editor
      .chain()
      .focus()
      .insertContentAt({ from: $pos.before(), to: $pos.after() }, text)
      .run();
  }

  const singleLine = !text.includes("\n");
  const before = parent.isTextblock ? parent.textBetween(0, $pos.parentOffset) : "";
  if (singleLine && before && !/\s$/.test(before)) {
    return editor
      .chain()
      .focus()
      .insertContentAt(pos, { type: "text", text: " " })
      .insertContentAt(pos + 1, text)
      .run();
  }
  return editor.chain().focus().insertContentAt(pos, text).run();
}
