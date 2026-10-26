"use client";

// The app-wide ⇧C (MIN-803). A row of a collection sidebar that names a
// comment target (`data-comment-target`) and sits under the pointer opens its
// item, asking for its comment field; with no such row, ⇧C goes to the comment
// field of the view on screen (lib/comment-focus.ts).
//
// Bubble phase on purpose: the hover handlers of issue cards listen in the
// capture phase and stop the key, so a hovered card keeps its own ⇧C (which
// opens the panel the page owns) before this listener ever sees it.

import { useEffect } from "react";
import { focusCurrentCommentSurface, requestCommentFocus } from "@/lib/comment-focus";
import { eventKey } from "@/lib/keyboard/event-key";
import { isTypingTarget, useChordPrefixForEvents } from "@/lib/keyboard/keyboard-context";

/** The innermost hovered element carrying a comment target, if any. */
function hoveredCommentRow(): HTMLElement | null {
  let innermost: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>("[data-comment-target]")) {
    if (el.matches(":hover")) innermost = el;
  }
  return innermost;
}

export function CommentShortcut() {
  const chordPrefixRef = useChordPrefixForEvents();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return;
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return;
      if (eventKey(e) !== "c") return;
      if (isTypingTarget(e.target)) return;
      if (chordPrefixRef.current !== null) return;
      const row = hoveredCommentRow();
      if (row?.dataset.commentTarget) {
        requestCommentFocus(row.dataset.commentTarget);
        // The row's own click opens its item, by the path a click takes.
        row.click();
      } else if (!focusCurrentCommentSurface()) {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chordPrefixRef]);
  return null;
}
