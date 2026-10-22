"use client";

import { useEffect, useRef } from "react";

/** How long a closed creation dialog keeps its content in memory before
    saving it as a draft (MIN-776). */
export const HELD_DRAFT_DELAY_MS = 2 * 60 * 1000;

export interface HeldDraftOptions {
  open: boolean;
  /**
   * Where this opening comes from: the project, the tray draft, the prefilled
   * seed. Held content resumes only in the same context; another context
   * saves it as a draft and starts from a blank form.
   */
  context: string;
  hasContent: () => boolean;
  /** Saves the current form as a draft. The snapshot is taken synchronously,
      before the first `await`, so `clear` may follow the call at once. */
  save: () => Promise<void>;
  /** Returns the form to a blank slate. */
  clear: () => void;
  /** A held form could not be saved before a new opening cleared it. */
  onLost: () => void;
}

/**
 * Keeps a creation dialog's content across a close (MIN-776).
 *
 * Closing no longer asks whether to keep a draft: the form stays as it is, and
 * reopening the dialog resumes it. Two minutes after a close without
 * reopening, the content is saved to the draft store and the form clears, so
 * the drafts tray offers it from then on. An opening from another context, or
 * an unmount (leaving the route that mounts the dialog), saves the held
 * content as a draft too, so nothing written is lost.
 *
 * Call it before the dialog's own opening effects: effects run in order, and
 * the returned ref tells them, during the opening, whether the form is being
 * resumed (keep it) or starts fresh (apply the presets).
 */
export function useHeldDraft(options: HeldDraftOptions) {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });
  const resuming = useRef(false);
  const heldContext = useRef<string | null>(null);
  const { open } = options;

  useEffect(() => {
    const { context, hasContent, save, clear, onLost } = latest.current;
    if (open) {
      const held = hasContent();
      resuming.current = held && heldContext.current === context;
      heldContext.current = context;
      if (held && !resuming.current) {
        save().catch(onLost);
        clear();
      }
      return;
    }
    resuming.current = false;
    if (!hasContent()) return;
    let closed = true;
    const timer = window.setTimeout(() => {
      // A failed save keeps the form held: it is still there on reopening.
      latest.current.save().then(() => {
        if (closed) latest.current.clear();
      }, () => {});
    }, HELD_DRAFT_DELAY_MS);
    return () => {
      closed = false;
      window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => () => {
    const { hasContent, save } = latest.current;
    if (hasContent()) save().catch(() => {});
  }, []);

  return resuming;
}
