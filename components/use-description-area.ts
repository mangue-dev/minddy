"use client";

import { useCallback, useRef, type MouseEvent } from "react";
import type { DocumentEditorApi } from "@/components/editor/document-editor";

/** What answers a tap itself: the text, and the controls placed among it. */
const OWN_TARGETS = ".ProseMirror, button, a, input, textarea, select, [role='button'], [contenteditable='true']";

/**
 * The description of a creation form owns the whole empty area under it
 * (MIN-907): on a phone the area grows down to the form's buttons
 * (`.creation-description-area`, app/globals.css), and a tap anywhere in it
 * that the text does not take puts the caret at the end of the description.
 */
export function useDescriptionArea() {
  const api = useRef<DocumentEditorApi | null>(null);
  const bind = useCallback((next: DocumentEditorApi) => {
    api.current = next;
  }, []);
  const onClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if ((event.target as Element).closest(OWN_TARGETS)) return;
    api.current?.focus();
  }, []);
  return { bind, onClick };
}
