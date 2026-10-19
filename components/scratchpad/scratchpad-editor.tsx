"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Mic01Icon as Mic } from "@hugeicons/core-free-icons";
import type { Editor, Extensions, JSONContent } from "@tiptap/react";
import {
  bodyFromMarkdown,
  documentForEditor,
  reconcileBodyBlocks,
} from "@/lib/pages-markdown";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import {
  removeSettledTasks,
  scratchpadSectionSubtree,
  stripScratchpadSpacers,
} from "@/lib/scratchpad";
import { AgentBeam } from "@/components/agent-beam";
import { RichEditor, editorMarkdown } from "@/components/editor/rich-editor";
import { useAttachmentImageUploads } from "@/components/editor/document-uploads";
import { SectionCopy } from "@/components/scratchpad/section-copy-extension";
import { ScratchpadParagraph } from "@/components/scratchpad/scratchpad-paragraph";
import { PasteMarkdownTasks } from "@/components/scratchpad/paste-markdown";
import { HeadingFromListInput } from "@/components/scratchpad/heading-from-list-input";
import { ScratchpadTaskSurface } from "@/components/scratchpad/scratchpad-task";
import {
  nodeRank,
  startPendingTasks,
} from "@/components/scratchpad/start-tasks";
import type { PageSlashItem } from "@/components/pages/page-slash-command";
import { useDictation } from "@/components/scratchpad/use-dictation";
import { DictateWaveform } from "@/components/ai-elements/dictate-waveform";
import { eventKey } from "@/lib/keyboard/event-key";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";

/** mm:ss for the dictation timer. */
function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, "0")}`;
}

function getMarkdown(editor: Editor): string {
  const md = editorMarkdown(editor);
  // An empty doc is a single empty paragraph → the paragraph serializer emits a
  // lone nbsp spacer (scratchpad-paragraph.ts). Normalize a doc that is ONLY
  // spacers back to "" so a blank note stores blank (spacers are only kept when
  // they sit among real content).
  return stripScratchpadSpacers(md).trim() === "" ? "" : md;
}

/**
 * The interval [from, to) of the document covered by the `index`-th title — the
 * same index as that placed on the hover buttons (section-copy-extension,
 * first-level titles), and the same scope as `scratchpadSectionSubtree` :
 * SUBSECTIONS INCLUDED, until the next title of equal or higher rank.
 */
function sectionRange(
  editor: Editor,
  index: number
): { from: number; to: number } | null {
  const doc = editor.state.doc;
  let seen = -1;
  let from: number | null = null;
  let to: number | null = null;
  let rank = 0;
  doc.forEach((node, pos) => {
    if (node.type.name !== "heading") return;
    if (from === null) {
      seen += 1;
      if (seen === index) {
        from = pos;
        rank = nodeRank(node);
      }
    } else if (to === null && nodeRank(node) <= rank) {
      to = pos;
    }
  });
  return from === null ? null : { from, to: to ?? doc.content.size };
}

/**
 * Always-editable WYSIWYG note (edit == preview, no raw-markdown mode, no
 * intermediary). Reads/writes markdown; autosaves debounced + on blur + on
 * unmount. Each heading carries a hover "copy section" control.
 */
export function ScratchpadEditor({
  initialValue,
  initialDocument = null,
  onChange,
  onCopySection,
  startOnCopy,
  placeholder,
  copySectionLabel,
  markdownRef,
  applyExternalRef,
  removeSettledRef,
  startAllRef,
  mentions,
  uploadScope = null,
}: {
  initialValue: string;
  /** The stored editor document of the note (MIN-728); opens reconciled with
      `initialValue`, which stays the authority. */
  initialDocument?: JSONContent | null;
  onChange: (markdown: string, document: JSONContent | null) => void;
  /** “Copy section” — `moved` = tasks passed “in progress” by the way. */
  onCopySection: (markdown: string, moved: number) => void;
  /** The account option “copy prompt starts the job” (MIN-20): it
 controls the copy gesture, both at the line and at the section. */
  startOnCopy: boolean;
  placeholder: string;
  copySectionLabel: string;
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
  removeSettledRef?: MutableRefObject<(() => number) | null>;
  /** Populated with an action that sets all tasks yet to be done in the notebook to "in progress" (returns how many) — the header gestures, which carry over the entire note. */
  startAllRef?: MutableRefObject<(() => number) | null>;
  /** Cross-project references placed with "@" in the notebook. */
  mentions?: DocumentEditorMentions;
  /** Where the note's images are stored: the account's own scope (MIN-728). */
  uploadScope?: string | null;
}) {
  const t = useTranslations("Scratchpad");
  const tDictate = useTranslations("Dictate");

  const editorRef = useRef<Editor | null>(null);
  const mentionsRef = useRef(mentions);
  mentionsRef.current = mentions;
  // Tiptap can normalize the initial markdown, so this baseline is refreshed
  // from the live editor as soon as it exists, before any user edit is submitted.
  const lastSubmittedRef = useRef(initialValue);
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

  // The blocks come from the shared catalog, like on a page; the notebook adds
  // the one gesture that is its own: dictating tasks.
  const slashActions = useMemo<PageSlashItem[]>(
    () => [
      {
        key: "dictate",
        label: t("slashDictate"),
        icon: Mic,
        keywords: ["dictate", "dicter", "voice", "voix", "micro", "vocal", "audio"],
        run: (editor, range) => {
          editor.chain().focus().deleteRange(range).run();
          startDictationRef.current();
        },
      },
    ],
    [t]
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onCopySectionRef = useRef(onCopySection);
  onCopySectionRef.current = onCopySection;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submitIfChanged = (markdown: string) => {
    if (markdown === lastSubmittedRef.current) return;
    lastSubmittedRef.current = markdown;
    const ed = editorRef.current;
    onChangeRef.current(markdown, ed && !ed.isDestroyed ? ed.getJSON() : null);
  };
  const scheduleCommit = (markdown: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (markdown === lastSubmittedRef.current) {
      timerRef.current = null;
      return;
    }
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      submitIfChanged(markdown);
    }, 500);
  };
  const flush = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const ed = editorRef.current;
    if (ed && !ed.isDestroyed) submitIfChanged(getMarkdown(ed));
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;

  // Drop completed tasks from the LIVE editor (the source of truth while open),
  // then save. Returns how many were removed so the caller can confirm.
  const removeSettled = () => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return 0;
    const { content: next, removed } = removeSettledTasks(getMarkdown(ed));
    if (removed === 0) return 0;
    // Re-read the Markdown, keeping every block it did not drop as it was.
    ed.commands.setContent(
      reconcileBodyBlocks(ed.getJSON(), bodyFromMarkdown(next, "notebook"), "notebook")
    );
    submitIfChanged(next);
    return removed;
  };
  const removeSettledFnRef = useRef(removeSettled);
  removeSettledFnRef.current = removeSettled;

  // Skip the entire notebook to “current” — the scope of the header buttons.
  const startAll = () => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return 0;
    return startPendingTasks(ed, 0, ed.state.doc.content.size);
  };
  const startAllFnRef = useRef(startAll);
  startAllFnRef.current = startAll;

  // The gesture carried by the hover buttons of a title: the section starts with
  // EVERYTHING it contains (including subsections), and `start` starts from it
  // tasks still to be done.
  //
  // The markdown is reread AFTER the move: the section exits with its
  // post-gesture markers, exactly like the line of a copied task
  // (scratchpad-task.tsx) — otherwise the prompt would describe a “to do”
  // work that the notebook says is already in progress.
  const sectionGesture = (
    headingIndex: number,
    start: boolean
  ): { markdown: string; moved: number } | null => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return null;
    const range = sectionRange(ed, headingIndex);
    const moved =
      start && range ? startPendingTasks(ed, range.from, range.to) : 0;
    const markdown = scratchpadSectionSubtree(
      getMarkdown(ed),
      headingIndex
    )?.markdown;
    return markdown?.trim() ? { markdown, moved } : null;
  };
  // Reassigned each time it is rendered (SectionCopy only reads its options once, at
  // creation of the plugin, but calls the ref at the time of clicking).
  const copySectionRef = useRef<(headingIndex: number) => void>(() => {});
  copySectionRef.current = (headingIndex: number) => {
    const done = sectionGesture(headingIndex, startOnCopy);
    if (done) onCopySectionRef.current(done.markdown, done.moved);
  };

  // Read once by the engine, at build time: identities must not move.
  const [extensions] = useState<Extensions>(
    () =>
      [
        HeadingFromListInput,
        // AFTER Markdown (the engine mounts surface extensions last): she
        // borrows its parser to reread a paste that the clipboard HTML would
        // otherwise have taken away (paste-markdown.ts).
        PasteMarkdownTasks,
        SectionCopy.configure({
          label: copySectionLabel,
          onCopy: (index) => copySectionRef.current(index),
        }),
      ] as unknown as Extensions
  );
  // The notebook keeps its deliberate empty lines across the Markdown round
  // trip (scratchpad-paragraph.ts): its paragraph replaces the catalog's.
  const [nodeExtensions] = useState(() => ({ paragraph: ScratchpadParagraph }));
  const [initialContent] = useState(() =>
    documentForEditor(initialValue, initialDocument, "notebook"));
  const [editor, setEditor] = useState<Editor | null>(null);
  const imageUploads = useAttachmentImageUploads(editorRef, uploadScope ?? "");
  const [canUpload] = useState(() => !!uploadScope);

  const handleEditor = useCallback(
    (next: Editor | null) => {
      // A destroyed instance is about to be replaced (`onEditor` follows).
      if (next?.isDestroyed) return;
      editorRef.current = next;
      setEditor(next);
      if (!next) return;
      // Tiptap can normalize the initial Markdown: the baseline is the
      // editor's own reading of it, so opening the notebook never saves.
      lastSubmittedRef.current = getMarkdown(next);
      if (markdownRef) markdownRef.current = () => getMarkdown(next);
      if (applyExternalRef)
        applyExternalRef.current = (content, opts) => {
          if (next.isDestroyed) return;
          const emitUpdate = opts?.emitUpdate ?? false;
          // Merged or remote Markdown: keep the blocks it did not change as
          // they are — IDs, colors, pills — like pages absorb an agent edit.
          next.commands.setContent(
            reconcileBodyBlocks(next.getJSON(), bodyFromMarkdown(content, "notebook"), "notebook"),
            { emitUpdate }
          );
          if (!emitUpdate) lastSubmittedRef.current = getMarkdown(next);
        };
      if (removeSettledRef)
        removeSettledRef.current = () => removeSettledFnRef.current();
      if (startAllRef) startAllRef.current = () => startAllFnRef.current();
    },
    // The refs are the caller's, stable for the editor's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const engineMentions = useMemo(
    () =>
      mentions
        ? {
            items: () => mentionsRef.current?.options ?? [],
            onQuery: () => mentionsRef.current?.onQuery?.(),
            scan: mentions.scan,
          }
        : undefined,
    [mentions]
  );

  // Persist any pending edit when the modal closes (component unmounts).
  useEffect(
    () => () => {
      flush();
      if (markdownRef) markdownRef.current = null;
      if (applyExternalRef) applyExternalRef.current = null;
      if (removeSettledRef) removeSettledRef.current = null;
      if (startAllRef) startAllRef.current = null;
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
  // The surface that says what “entrust a task” means HERE: the
  // notebook closes when leaving, and dismantling flushes the autosave
  // (see scratchpad-task.tsx). It wraps the editor because the views
  // of nodes are rendered, as portals, in the EditorContent subtree.
  return (
    <ScratchpadTaskSurface>
      <div
        className="scratchpad-editor relative min-h-[55vh] cursor-text pb-[40vh]"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget && editor && !editor.isDestroyed) editor.commands.focus("end");
        }}
      >
        <RichEditor
          initialContent={initialContent}
          onChange={(_content, live) => scheduleCommit(getMarkdown(live))}
          onBlur={() => flush()}
          onEditor={handleEditor}
          blocks="document"
          // The notebook is edited like a page (MIN-728): handles, `+` and
          // the block menu, without a block link — a note has no address.
          blockChrome
          blockLinks={false}
          size="page"
          mentions={engineMentions}
          mentionLinks={mentions?.links ?? null}
          placeholder={placeholder}
          slashActions={slashActions}
          extensions={extensions}
          nodeExtensions={nodeExtensions}
          uploads={canUpload ? imageUploads : undefined}
          immediateRender
          autoFocus
        />

        {dictating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-sm">
            {/* The border ONLY accompanies “Numo cleans up”: the step
 `processing` just before, it is the transcription of the audio, not
 Numo. The wrapper is in `overflow: hidden`, hence the `shadow-xl`
 which passes from the card to it; `keepMounted` keeps the card — and
 the waveform canvas — raised from one end to the other of the dictated
, instead of raising it when the border lights up. */}
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
    </ScratchpadTaskSurface>
  );
}
