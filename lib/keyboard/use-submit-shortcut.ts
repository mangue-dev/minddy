"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { planSubmitShortcut } from "@/lib/keyboard/submit-shortcut";

/**
 * Branch ⌘/Ctrl + Enter on the main button of a form.
 *
 * ```tsx
 * const submitShortcut = useSubmitShortcut();
 * <form {...submitShortcut} onSubmit={…}>…</form>
 * ```
 *
 * The rule is in [submit-shortcut.ts]; only the DOM remains here.
 *
 * Two wiring details, both desired:
 *
 * - listening is in **capture**. tiptap binds `Mod-Enter` to hard newline
 * on its own surface: when going up, the line would already be inserted. React
 * dispatches its capture listeners from the root, so before
 * the event does not reach the editor — this is the only place from which it can be
 *   lui reprendre ;
 * - on `stopPropagation()` en plus du `preventDefault()`, ce qui coupe aussi
 * the native event: without that, the title field (which submits on Enter)
 * would submit a second time.
 */
export function useSubmitShortcut({
  /**
   * How to recognize the home button. By default the first button
   * submission of the form — the second, when there is one (the chevron of a
   * `SplitButton`), is a `type="button"` that this selector does not see.
   *
   * To specify when the form accepts content that it does not choose
   * (the steps of a wizard): a `<button>` without `type` is a button
   * submission in the eyes of the browser, and would be mistaken for the CTA.
   */
  selector = 'button[type="submit"]',
}: { selector?: string } = {}) {
  const ref = useRef<HTMLFormElement>(null);

  const onKeyDownCapture = useCallback((e: KeyboardEvent) => {
    const form = ref.current;
    if (!form) return;
    const button = form.querySelector<HTMLButtonElement>(selector);
    const active = document.activeElement as HTMLElement | null;
    const plan = planSubmitShortcut(e, {
      hasEnabledSubmit: !!button && !button.disabled,
      activeIsEditor:
        !!active && active.isContentEditable && form.contains(active),
    });
    if (plan === "ignore" || !button) return;
    e.preventDefault();
    e.stopPropagation();
    if (plan === "click") {
      button.click();
      return;
    }
    // Exiting the editor raises your markdown; the click waits for the turn
    // next, when React rendered the form with this text.
    active?.blur();
    window.setTimeout(() => {
      if (!button.disabled) button.click();
    }, 0);
  }, [selector]);

  return { ref, onKeyDownCapture };
}
