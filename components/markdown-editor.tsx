"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "tiptap-markdown";
import { cn } from "mangue-ui";

/* Rendered-markdown typography — mirrors <Markdown> so the editing surface reads
   exactly like the committed description (same sizes, spacing, colors). */
const PROSE = cn(
  "text-sm leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-xs",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mt-2 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold",
  "[&_hr]:my-3 [&_hr]:border-border",
);

/**
 * Borderless WYSIWYG markdown editor. Content is edited as rendered rich text
 * (Notion-style — bold/headings/lists show live) and read/written as markdown.
 * No box, no radius: the editing surface is the description.
 *
 * Remount per issue with `key={issue.id}` so state resets cleanly; commits the
 * current markdown on blur.
 */
export function MarkdownEditor({
  value,
  onCommit,
  placeholder = "Ajoute une description…",
  className,
}: {
  value: string;
  onCommit: (markdown: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [empty, setEmpty] = useState(value.trim() === "");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Markdown.configure({
        html: false,
        linkify: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editorProps: { attributes: { class: PROSE } },
    onCreate: ({ editor }) => setEmpty(editor.isEmpty),
    onUpdate: ({ editor }) => setEmpty(editor.isEmpty),
    // tiptap-markdown adds `markdown` storage but doesn't augment TipTap's type.
    onBlur: ({ editor }) =>
      onCommit(
        (
          editor.storage as unknown as {
            markdown: { getMarkdown(): string };
          }
        ).markdown.getMarkdown()
      ),
  });

  return (
    <div
      className={cn("relative cursor-text", className)}
      onMouseDown={(e) => {
        // Clicking the empty gutter below the content should still focus the editor.
        if (e.target === e.currentTarget) editor?.commands.focus("end");
      }}
    >
      {empty && (
        <p className="pointer-events-none absolute top-0 left-0 text-sm text-muted-foreground/70">
          {placeholder}
        </p>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
