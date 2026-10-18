"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { cn } from "mangue-ui";
import type {
  DocumentEditorMentions,
  DocumentEditorProps,
} from "@/components/editor/document-editor";

export type { DocumentEditorMentions };

/**
 * Deferred access to the document editor (MIN-728).
 *
 * The editor pulls tiptap + lowlight (~1.5 MB minified) into every route that
 * hosts an editing surface — both boards through the issue side panel and the
 * creation dialog, plus triage, objectives and feedback. Those routes are the
 * ones users navigate between constantly, yet the editor only runs once a
 * dialog or panel actually opens. Rendering it through this boundary keeps
 * tiptap out of the route graph: the hosting page paints without it, and the
 * chunk streams in during idle time (see `useIdleDocumentEditorPreload`) so a
 * first open waits on nothing.
 *
 * While the chunk loads, the fallback mirrors the committed value as plain
 * text at the same typography, so an opened description never flashes empty;
 * the rich surface replaces it in place. The same visual contract as the
 * committed markdown is intentional — see PROSE in components/editor/rich-editor.tsx.
 */
type EditorModule = typeof import("@/components/editor/document-editor");

/** The module once loaded: later surfaces use it directly (MIN-728). */
let loaded: EditorModule | null = null;

function loadEditor(): Promise<EditorModule> {
  return import("@/components/editor/document-editor").then((module) => {
    loaded = module;
    return module;
  });
}

const DocumentEditorImpl = lazy(() =>
  loadEditor().then((m) => ({ default: m.DocumentEditor }))
);

export type LazyDocumentEditorProps = DocumentEditorProps;

/** The committed text at the editor's typography, while the editor is not
 mounted yet (its chunk, or the document it waits for). */
export function DocumentEditorFallback({
  value,
  className,
}: Pick<LazyDocumentEditorProps, "value" | "className">) {
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

export function LazyDocumentEditor(props: LazyDocumentEditorProps) {
  // Once the chunk is loaded the editor renders in this very commit: even an
  // already-resolved `lazy` suspends once, which painted the raw text first.
  // Decided once per instance, so an editor is never remounted by the switch.
  const [ready] = useState(() => loaded);
  if (ready) return <ready.DocumentEditor {...props} />;
  return (
    <Suspense fallback={<DocumentEditorFallback value={props.value} className={props.className} />}>
      <DocumentEditorImpl {...props} />
    </Suspense>
  );
}

/**
 * Mount the rich editor one paint after the surface that hosts it — only
 * while its chunk is still loading (see below).
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
export function DeferredDocumentEditor(props: LazyDocumentEditorProps) {
  // With the chunk already loaded there is nothing to defer: the editor builds
  // its document during this render, formatted from the first frame.
  const [ready, setReady] = useState(() => loaded !== null);
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
    return <DocumentEditorFallback value={props.value} className={props.className} />;
  }
  return <LazyDocumentEditor {...props} />;
}

let preloadStarted = false;

/** Fetch the editor module now. Safe to call repeatedly: ES module evaluation
    runs once, and every later call awaits the same cached promise. */
export function preloadDocumentEditor() {
  void loadEditor();
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
export function useIdleDocumentEditorPreload() {
  useEffect(() => {
    if (preloadStarted || typeof window === "undefined") return;
    preloadStarted = true;
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(() => preloadDocumentEditor(), { timeout: 3000 });
    } else {
      window.setTimeout(preloadDocumentEditor, 1500);
    }
  }, []);
}
