"use client";

import { useCallback, useEffect, useRef, type ChangeEvent, type Ref } from "react";
import { applyArrowRule } from "@/lib/arrow-input";

/**
 * “->” becomes “→” while typing in a PLAIN TEXT field — the same gesture the
 * body editors get from the ProseMirror input rules
 * (components/editor-arrows.ts). The page title, the issue titles and the
 * database text cells use this hook; the substitution commits into the value
 * itself, so everything that later reads the field (sidebar, search,
 * notifications) finds the real arrow.
 *
 * Spread-friendly contract: give the returned `ref` to the field (it merges
 * any ref the caller already holds) and route the `onChange` value through
 * `read` — it returns the value to store, substitution applied, and restores
 * the caret once React has committed it. An IME composition in progress is
 * returned untouched.
 */
export function useArrowField(forwardedRef?: Ref<HTMLTextAreaElement>) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const pendingCaret = useRef<number | null>(null);

  useEffect(() => {
    if (pendingCaret.current == null) return;
    field.current?.setSelectionRange(pendingCaret.current, pendingCaret.current);
    pendingCaret.current = null;
  });

  // Stable on purpose: a forwarded callback that focuses or selects its node
  // (the database cell editor) must run on mount and unmount only, not on
  // every render of the holder.
  const ref = useCallback(
    (el: HTMLTextAreaElement | null) => {
      field.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    },
    [forwardedRef]
  );

  /** The value to store for this change, arrow substitution applied. */
  const read = (event: ChangeEvent<HTMLTextAreaElement>): string => {
    const value = event.target.value;
    // An IME composition in progress (Japanese, Chinese…) is still building
    // its text: substituting inside it would corrupt it. The rule waits for
    // the composition to commit.
    if (event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing) {
      return value;
    }
    const element = event.currentTarget;
    const rule = applyArrowRule(value, element.selectionStart ?? value.length);
    if (!rule) return value;
    pendingCaret.current = rule.caret;
    return rule.text;
  };

  return { ref, read };
}
