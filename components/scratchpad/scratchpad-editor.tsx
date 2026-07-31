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
import {
  removeCompletedTasks,
  splitScratchpadSections,
  stripScratchpadSpacers,
} from "@/lib/scratchpad";
import { AgentBeam } from "@/components/agent-beam";
import { SectionCopy } from "@/components/scratchpad/section-copy-extension";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
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
import { eventKey } from "@/lib/keyboard/event-key";

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
  const md = (
    editor.storage as unknown as { markdown: { getMarkdown(): string } }
  ).markdown.getMarkdown();
  // An empty doc is a single empty paragraph → the paragraph serializer emits a
  // lone nbsp spacer (scratchpad-paragraph.ts). Normalize a doc that is ONLY
  // spacers back to "" so a blank note stores blank (spacers are only kept when
  // they sit among real content).
  return stripScratchpadSpacers(md).trim() === "" ? "" : md;
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
  onLaunchSection,
  placeholder,
  copySectionLabel,
  launchSectionLabel,
  markdownRef,
  applyExternalRef,
  removeCompletedRef,
}: {
  initialValue: string;
  onChange: (markdown: string) => void;
  onCopySection: (markdown: string) => void;
  /** « Lancer un agent » sur la section survolée (MIN-84) — markdown de la section. */
  onLaunchSection: (markdown: string) => void;
  placeholder: string;
  copySectionLabel: string;
  launchSectionLabel: string;
  /** Populated with a getter for the editor's live markdown, so the parent's
      "copy all" reflects the current text without waiting for a debounced save. */
  markdownRef?: MutableRefObject<(() => string) | null>;
  /** Populated with a setter that replaces the editor's content — used by the
      sync layer to adopt a merged/remote version (see lib/use-scratchpad-query).
      `emitUpdate` defaults to false so adopting an already-persisted version does
      not trigger a redundant save. */
  applyExternalRef?: MutableRefObject<
    ((content: string, opts?: { emitUpdate?: boolean }) => void) | null
  >;
  /** Populated with an action that drops completed tasks from the live editor
      (returns how many were removed) — driven by the modal's toolbar button. */
  removeCompletedRef?: MutableRefObject<(() => number) | null>;
}) {
  const t = useTranslations("Scratchpad");
  const tDictate = useTranslations("Dictate");

  const editorRef = useRef<Editor | null>(null);
  const startDictationRef = useRef<() => void>(() => {});

  // Dictation → one checkbox task per entry Numo cleaned up (a single take can
  // hold several to-dos). They land at the caret, which sits on the empty line
  // the `/` command left behind.
  const insertTasks = (tasks: string[]) => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed || tasks.length === 0) return;
    let chain = ed.chain().focus();
    // `/` fires from an empty paragraph → turn it into a task; when the caret is
    // already inside a task, toggling would drop the list instead.
    if (!ed.isActive("taskItem")) chain = chain.toggleTaskList();
    chain.insertContent(tasks[0]).run();
    // One line per entry — each split is its own transaction so it sees the text
    // inserted just before it.
    for (const task of tasks.slice(1)) {
      ed.chain().focus().splitListItem("taskItem").insertContent(task).run();
    }
  };

  const dictation = useDictation({
    onTasks: insertTasks,
    getNote: () => {
      const ed = editorRef.current;
      return ed && !ed.isDestroyed ? getMarkdown(ed) : "";
    },
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
  const onLaunchSectionRef = useRef(onLaunchSection);
  onLaunchSectionRef.current = onLaunchSection;
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
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Drop completed tasks from the LIVE editor (the source of truth while open),
  // then save. Returns how many were removed so the caller can confirm.
  const removeCompleted = () => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return 0;
    const { content: next, removed } = removeCompletedTasks(getMarkdown(ed));
    if (removed === 0) return 0;
    ed.commands.setContent(next); // tiptap-markdown re-parses the markdown
    onChangeRef.current(next);
    return removed;
  };
  const removeCompletedFnRef = useRef(removeCompleted);
  removeCompletedFnRef.current = removeCompleted;

  // Stable across the editor's life (SectionCopy reads options once at plugin
  // creation) — resolves the clicked heading's section from the live markdown.
  const resolveSection = (headingIndex: number): string | null => {
    const ed = editorRef.current;
    if (!ed) return null;
    const sections = splitScratchpadSections(getMarkdown(ed)).filter(
      (s) => s.title !== null
    );
    return sections[headingIndex]?.markdown ?? null;
  };
  const copySectionRef = useRef((headingIndex: number) => {
    const markdown = resolveSection(headingIndex);
    if (markdown) onCopySectionRef.current(markdown);
  });
  const launchSectionRef = useRef((headingIndex: number) => {
    const markdown = resolveSection(headingIndex);
    if (markdown) onLaunchSectionRef.current(markdown);
  });

  // pnpm resolves @tiptap/core twice (same 3.27.4 version, two symlink paths),
  // so TaskList/TaskItem's Node type reads as a different identity than the one
  // useEditor expects. @tiptap/pm and @tiptap/core are single-versioned, so it's
  // purely a type artifact — cast to the react-side Extensions type.
  const extensions = [
    StarterKit.configure({ heading: { levels: [1, 2, 3] }, paragraph: false }),
    ScratchpadParagraph,
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
      launchLabel: launchSectionLabel,
      onLaunch: (index) => launchSectionRef.current(index),
    }),
    SlashCommand.configure({ items: slashItems }),
  ] as unknown as Extensions;

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: "end",
    extensions,
    content: initialValue,
    editorProps: {
      attributes: { class: PROSE },
      // Keep the caret off the bottom edge: ProseMirror scrolls it into view
      // with this much room to spare, so writing at the end of a long note
      // happens comfortably above the fold instead of on the last visible pixel
      // (the trailing space below is the wrapper's pb-[40vh]).
      scrollMargin: { top: 0, right: 0, bottom: 160, left: 0 },
      scrollThreshold: { top: 0, right: 0, bottom: 160, left: 0 },
    },
    onCreate: ({ editor }) => {
      editorRef.current = editor;
      if (markdownRef) markdownRef.current = () => getMarkdown(editor);
      if (applyExternalRef)
        applyExternalRef.current = (content, opts) => {
          if (editor.isDestroyed) return;
          editor.commands.setContent(content, {
            emitUpdate: opts?.emitUpdate ?? false,
          });
        };
      if (removeCompletedRef)
        removeCompletedRef.current = () => removeCompletedFnRef.current();
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
      if (applyExternalRef) applyExternalRef.current = null;
      if (removeCompletedRef) removeCompletedRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ⌘S / Ctrl+S saves now (autosave already runs; this is the explicit gesture
  // that drives the visible "saved" indicator) instead of the browser dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        !e.altKey &&
        eventKey(e) === "s"
      ) {
        e.preventDefault();
        flushRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

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

  // The bottom padding is room to scroll PAST the last line, so a note that
  // grows to the bottom isn't pinned against the edge. It sits on the editor
  // wrapper rather than the modal's scroll container so that empty space stays
  // click-to-write (the mousedown below drops the caret at the end).
  return (
    <div
      className="scratchpad-editor relative min-h-[55vh] cursor-text pb-[40vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) editor?.commands.focus("end");
      }}
    >
      <EditorContent editor={editor} />

      {dictating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          {/* Le liseré n'accompagne QUE « Numo met au propre » : l'étape
              `processing` juste avant, c'est la transcription de l'audio, pas
              Numo. Le wrapper est en `overflow: hidden`, d'où le `shadow-xl`
              qui passe de la carte à lui ; `keepMounted` garde la carte — et
              le canvas de la waveform — montée d'un bout à l'autre de la
              dictée, au lieu de la remonter quand le liseré s'allume. */}
          <AgentBeam
            active={dictation.status === "polishing"}
            keepMounted
            className="rounded-2xl shadow-xl"
          >
            <div className="flex w-64 flex-col items-center gap-4 rounded-2xl border border-border bg-popover px-6 py-5 text-center">
              {dictation.status === "processing" ||
              dictation.status === "polishing" ? (
                <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Spinner />
                  {dictation.status === "polishing"
                    ? t("dictationPolishing")
                    : t("dictationProcessing")}
                </div>
              ) : dictation.status === "starting" ? (
                <div className="flex flex-col items-center gap-2 py-3 text-sm text-muted-foreground">
                  <Spinner />
                  {tDictate("starting")}
                </div>
              ) : (
                <>
                  {/* The timer alone, centred: dictation is no longer
                      time-boxed, so there is no ceiling left to show opposite
                      it. */}
                  <div className="flex w-full items-center justify-center text-xs">
                    <span className="font-medium tabular-nums text-foreground">
                      {formatTime(dictation.elapsedMs)}
                    </span>
                  </div>
                  <DictateWaveform stream={dictation.stream} />
                  <p className="text-xs text-muted-foreground">
                    {t("dictationHint")}
                  </p>
                </>
              )}
            </div>
          </AgentBeam>
        </div>
      )}
    </div>
  );
}
