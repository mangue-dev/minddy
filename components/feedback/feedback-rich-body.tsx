"use client";

// Deferred editor: keeps tiptap (~1.5 MB) out of the hosting route —
// see components/editor/document-editor-lazy.tsx.
import { LazyDocumentEditor } from "@/components/editor/document-editor-lazy";
import type { FeedbackBodyProps } from "@/components/feedback/feedback-composer-dialog";

/**
 * The rich description of the feedback composer, for the signed-in app. Kept
 * in its own module so a surface without the editor's messages (the public
 * documentation's "Report an error") never imports it: it gets the plain
 * description instead.
 */
export function FeedbackRichBody({ bodyKey, initialBody, onBodyChange, placeholder, ariaLabel, onLeaveTop }: FeedbackBodyProps) {
  return (
    <LazyDocumentEditor
      key={bodyKey}
      value={initialBody}
      onLeaveTop={onLeaveTop}
      onCommit={onBodyChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      className="mt-3 min-h-24"
    />
  );
}
