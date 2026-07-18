"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import {
  useEditor,
  EditorContent,
  type Editor,
  type Extensions,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { Markdown } from "tiptap-markdown";
import { useTranslations } from "next-intl";
import { Spinner, cn } from "mangue-ui";
import { Heading1, Heading2, Heading3, List, ListTodo, Mic } from "lucide-react";
import { splitScratchpadSections } from "@/lib/scratchpad";
import { SectionCopy } from "@/components/scratchpad/section-copy-extension";
import {
  ScratchpadTaskItem,
  ScratchpadTaskList,
} from "@/components/scratchpad/scratchpad-task";
import {
  SlashCommand,
  type SlashItem,
} from "@/components/scratchpad/slash-command";
import { useDictation } from "@/components/scratchpad/use-dictation";
import { DictateWaveform } from "@/components/ai-elements/dictate-waveform";

/** mm:ss for the dictation timer. */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

/* Rendered-markdown typography for the note surface (mirrors <MarkdownEditor>).
   Task-list checkboxes, heading anchors and the section-copy button live in
   globals.css scoped to `.scratchpad-editor` — pseudo/`[data-type]` selectors
   don't fit an attributes class. */
const PROSE = cn(
  "text-base leading-relaxed break-words outline-none",
  "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_p]:my-2",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:text-sm",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_h1]:mt-5 [&_h1]:mb-1.5 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:tracking-tight",
  "[&_h2]:mt-5 [&_h2]:mb-1 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-tight",
  "[&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:text-lg [&_h3]:font-semibold",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_strong]:font-semibold",
  "[&_hr]:my-4 [&_hr]:border-border"
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
  const t = useTranslations("Scratchpad");
  const tDictate = useTranslations("Dictate");

  const editorRef = useRef<Editor | null>(null);
  const startDictationRef = useRef<() => void>(() => {});

  // Dictation → a checkbox task with the raw transcript (no Numo). Inserts at the
  // caret, which sits on the empty line the `/` command left behind.
  const dictation = useDictation((text) => {
    editorRef.current?.chain().focus().toggleTaskList().insertContent(text).run();
  });
  startDictationRef.current = dictation.start;

  const slashItems: SlashItem[] = [
    {
      title: t("slashTask"),
      icon: ListTodo,
      keywords: ["task", "tache", "tâche", "todo", "à faire", "checkbox"],
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      title: t("slashDictate"),
      icon: Mic,
      keywords: ["dictate", "dicter", "voice", "voix", "micro", "vocal", "audio"],
      run: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        startDictationRef.current();
      },
    },
    {
      title: t("slashH1"),
      icon: Heading1,
      keywords: ["title", "titre", "h1", "heading", "section"],
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
    },
    {
      title: t("slashH2"),
      icon: Heading2,
      keywords: ["title", "titre", "h2", "heading", "section"],
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
    },
    {
      title: t("slashH3"),
      icon: Heading3,
      keywords: ["title", "titre", "h3", "heading", "section"],
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
    },
    {
      title: t("slashBullet"),
      icon: List,
      keywords: ["list", "liste", "bullet", "puce"],
      run: (editor, range) =>
        editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
  ];

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCopySectionRef = useRef(onCopySection);
  onCopySectionRef.current = onCopySection;
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
    ScratchpadTaskList,
    ScratchpadTaskItem,
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
    SlashCommand.configure({ items: slashItems }),
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

  // While recording: Enter stops (→ transcribe → task), Escape cancels. Captured
  // so neither the editor nor the dialog sees the keystroke.
  useEffect(() => {
    if (dictation.status !== "recording") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        dictation.stop();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        dictation.cancel();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [dictation.status, dictation.stop, dictation.cancel]);

  const dictating = dictation.status !== "idle";
  const nearLimit =
    dictation.status === "recording" && dictation.elapsedMs >= 80_000;

  return (
    <div
      className="scratchpad-editor relative min-h-[55vh] cursor-text"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) editor?.commands.focus("end");
      }}
    >
      <EditorContent editor={editor} />

      {dictating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex w-64 flex-col items-center gap-4 rounded-2xl border border-border bg-popover px-6 py-5 text-center shadow-xl">
            {dictation.status === "processing" ? (
              <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
                <Spinner />
                {t("dictationProcessing")}
              </div>
            ) : dictation.status === "starting" ? (
              <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
                <Spinner />
                {tDictate("starting")}
              </div>
            ) : (
              <>
                <div className="flex w-full items-center justify-between text-xs text-muted-foreground">
                  <span
                    className={cn(
                      "font-medium tabular-nums",
                      nearLimit
                        ? "text-destructive animate-pulse"
                        : "text-foreground"
                    )}
                  >
                    {formatTime(dictation.elapsedMs)}
                  </span>
                  <span>{tDictate("maxDuration")}</span>
                </div>
                <DictateWaveform stream={dictation.stream} />
                <p className="text-xs text-muted-foreground">
                  {t("dictationHint")}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
