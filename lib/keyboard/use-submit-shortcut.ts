"use client";

import { useCallback, useRef } from "react";
import type { KeyboardEvent } from "react";
import { planSubmitShortcut } from "@/lib/keyboard/submit-shortcut";

const MODAL_SURFACES =
  '[data-slot="dialog-content"],[data-slot="alert-dialog-content"],[data-slot="sheet-content"]';

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
 * dispatches its capture listeners from the root, before the event reaches
 * the editor — the only place from which the shortcut can be taken back;
 * - `stopPropagation()` on top of `preventDefault()`, which also stops
 * the native event: without that, the title field (which submits on Enter)
 * would submit a second time.
 *
 * In a dialog, put `ref` on the form and `onKeyDownCapture` on the dialog
 * content: the shortcut then also works with the focus outside the form —
 * on the "Create in" pill, or on the dialog itself after a click on its
 * background — where a listener on the form alone never heard it. A dialog
 * opened ON TOP keeps its keys: the event is ignored when it comes from a
 * modal surface that does not hold this form.
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
    const target = e.target instanceof Element ? e.target : null;
    const surface = target?.closest(MODAL_SURFACES);
    if (surface && !surface.contains(form)) return;
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
