"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "mangue-ui";
import type { MarkdownEditorMentions } from "@/components/markdown-editor";

export type { MarkdownEditorMentions };

/**
 * Deferred access to the rich markdown editor.
 *
 * The editor pulls tiptap + lowlight (~1.5 MB minified) into every route that
 * hosts an editing surface — both boards through the issue side panel and the
 * creation dialog, plus triage, objectives and feedback. Those routes are the
 * ones users navigate between constantly, yet the editor only runs once a
 * dialog or panel actually opens. Rendering it through this boundary keeps
 * tiptap out of the route graph: the hosting page paints without it, and the
 * chunk streams in during idle time (see `useIdleMarkdownEditorPreload`) so a
 * first open waits on nothing.
 *
 * While the chunk loads, the fallback mirrors the committed value as plain
 * text at the same typography, so an opened description never flashes empty;
 * the rich surface replaces it in place. The same visual contract as the
 * committed markdown is intentional — see PROSE in markdown-editor.tsx.
 */
const MarkdownEditorImpl = lazy(() =>
  import("@/components/markdown-editor").then((m) => ({
    default: m.MarkdownEditor,
  }))
);

export type MarkdownEditorProps = {
  value: string;
  onCommit: (markdown: string) => void;
  /** Live emptiness signal (fires on mount and on each edit) — see the real
      editor: onCommit only fires on blur, callers track typing through this. */
  onEmptyChange?: (empty: boolean) => void;
  onEdit?: () => void;
  /** Live markdown on every edit — lets a caller commit what is on screen
      without a blur (close, tab switch, window blur). */
  onChange?: (markdown: string) => void;
  mentions?: MarkdownEditorMentions;
  placeholder?: string;
  className?: string;
};

function EditorFallback({
  value,
  className,
}: Pick<MarkdownEditorProps, "value" | "className">) {
  if (value.trim() === "") {
    return (
      <div
        className={cn("min-h-10 animate-pulse rounded-md bg-muted/50", className)}
        aria-hidden
      />
    );
  }
  return (
    <div
      className={cn(
        "text-sm leading-relaxed break-words whitespace-pre-wrap outline-none",
        className
      )}
      aria-hidden
    >
      {value}
    </div>
  );
}

export function MarkdownEditor(props: MarkdownEditorProps) {
  return (
    <Suspense fallback={<EditorFallback value={props.value} className={props.className} />}>
      <MarkdownEditorImpl {...props} />
    </Suspense>
  );
}

/**
 * Mount the rich editor one paint after the surface that hosts it.
 *
 * Constructing the Tiptap/ProseMirror view is a long synchronous task (hundreds
 * of DOM nodes plus the extension set). Mounting it inside the same commit as
 * the hosting dialog turns the opening gesture into one long blocking task —
 * measured as the bulk of a warm issue-panel open. This wrapper paints the
 * hosting surface first with the exact same fallback the Suspense boundary
 * already uses (the committed markdown as plain text, same typography), then
 * swaps in the rich editor two frames later. The visual contract is unchanged:
 * the fallback exists precisely to mirror the committed value, so the
 * description never flashes empty or restyles — only the moment the editor
 * becomes editable shifts by a couple of frames.
 *
 * The swap is keyed by the host (the parent remounts this wrapper through its
 * own key), and drafts are safe: the wrapper holds no state; the editor only
 * mounts once its props are final for this instance.
 */
export function DeferredMarkdownEditor(props: MarkdownEditorProps) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ready) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(first);
      if (second) cancelAnimationFrame(second);
    };
  }, [ready]);
  if (!ready) {
    return <EditorFallback value={props.value} className={props.className} />;
  }
  return <MarkdownEditor {...props} />;
}

let preloadStarted = false;

/** Fetch the editor module now. Safe to call repeatedly: ES module evaluation
    runs once, and every later call awaits the same cached promise. */
export function preloadMarkdownEditor() {
  void import("@/components/markdown-editor");
}

/**
 * Warm the editor chunk during browser idle time after mount.
 *
 * Call from components that host an editing surface (boards, triage,
 * objectives…): their first paint stays clean of tiptap, but by the time the
 * user opens a dialog or clicks a ticket — seconds later, typically — the
 * chunk is already parsed and the editor mounts instantly.
 *
 * One schedule per tab (module flag): several mounted surfaces must not queue
 * duplicate work, and re-mounts after navigations would otherwise restart the
 * download check forever. `timeout` bounds how long a busy main thread may
 * starve the callback before it fires anyway.
 */
export function useIdleMarkdownEditorPreload() {
  useEffect(() => {
    if (preloadStarted || typeof window === "undefined") return;
    preloadStarted = true;
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => preloadMarkdownEditor(), { timeout: 3000 });
    } else {
      window.setTimeout(preloadMarkdownEditor, 1500);
    }
  }, []);
}
