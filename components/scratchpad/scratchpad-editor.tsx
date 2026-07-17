"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import {
  useEditor,
  EditorContent,
  type Editor,
  type Extensions,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TaskList, TaskItem } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "tiptap-markdown";
import { cn } from "mangue-ui";
import { splitScratchpadSections } from "@/lib/scratchpad";
import { SectionCopy } from "@/components/scratchpad/section-copy-extension";

/* Rendered-markdown typography for the note surface (mirrors <MarkdownEditor>).
   Task-list checkboxes, heading anchors and the section-copy button live in
   globals.css scoped to `.scratchpad-editor` — pseudo/`[data-type]` selectors
   don't fit an attributes class. */
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
  "[&_h1]:mt-4 [&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-semibold",
  "[&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold",
  "[&_hr]:my-3 [&_hr]:border-border"
);

function getMarkdown(editor: Editor): string {
  // tiptap-markdown adds `markdown` storage but doesn't augment TipTap's type.
  return (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
}

/**
 * Always-editable WYSIWYG note (edit == preview, no raw-markdown mode, no
 * intermediary). Reads/writes markdown; autosaves debounced + on blur + on
 * unmount. Each heading carries a hover "copy section" control.
 */
export function ScratchpadEditor({
  initialValue,
  onChange,
  onCopySection,
  placeholder,
  copySectionLabel,
  markdownRef,
}: {
  initialValue: string;
  onChange: (markdown: string) => void;
  onCopySection: (markdown: string) => void;
  placeholder: string;
  copySectionLabel: string;
  /** Populated with a getter for the editor's live markdown, so the parent's
      "copy all" reflects the current text without waiting for a debounced save. */
  markdownRef?: MutableRefObject<(() => string) | null>;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCopySectionRef = useRef(onCopySection);
  onCopySectionRef.current = onCopySection;
  const editorRef = useRef<Editor | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleCommit = (markdown: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onChangeRef.current(markdown);
    }, 500);
  };
  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) onChangeRef.current(getMarkdown(ed));
  };

  // Stable across the editor's life (SectionCopy reads options once at plugin
  // creation) — resolves the clicked heading's section from the live markdown.
  const copySectionRef = useRef((headingIndex: number) => {
    const ed = editorRef.current;
    if (!ed) return;
    const sections = splitScratchpadSections(getMarkdown(ed)).filter(
      (s) => s.title !== null
    );
    const section = sections[headingIndex];
    if (section) onCopySectionRef.current(section.markdown);
  });

  // pnpm resolves @tiptap/core twice (same 3.27.4 version, two symlink paths),
  // so TaskList/TaskItem's Node type reads as a different identity than the one
  // useEditor expects. @tiptap/pm and @tiptap/core are single-versioned, so it's
  // purely a type artifact — cast to the react-side Extensions type.
  const extensions = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Markdown.configure({
      html: false,
      linkify: true,
      transformPastedText: true,
      transformCopiedText: true,
    }),
    // Placeholder on the current empty line (follows the cursor), so every new
    // line invites input — not just the empty document.
    Placeholder.configure({ placeholder, showOnlyCurrent: true }),
    SectionCopy.configure({
      label: copySectionLabel,
      onCopy: (index) => copySectionRef.current(index),
    }),
  ] as unknown as Extensions;

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: "end",
    extensions,
    content: initialValue,
    editorProps: { attributes: { class: PROSE } },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      if (markdownRef) markdownRef.current = () => getMarkdown(editor);
    },
    onUpdate: ({ editor }) => {
      scheduleCommit(getMarkdown(editor));
    },
    onBlur: () => flush(),
  });
  editorRef.current = editor ?? editorRef.current;

  // Persist any pending edit when the modal closes (component unmounts).
  useEffect(
    () => () => {
      flush();
      if (markdownRef) markdownRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <div
      className="scratchpad-editor relative min-h-[55vh] cursor-text"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) editor?.commands.focus("end");
      }}
    >
      <EditorContent editor={editor} />
    </div>
  );
}
