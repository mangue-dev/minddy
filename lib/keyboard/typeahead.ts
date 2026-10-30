"use client";

import { useEffect, useRef } from "react";

/**
 * Type-ahead into a Numo composer (home page, assistant shell).
 *
 * Where a composer waits, a bare letter is ambiguous: one `c` is the
 * create-issue shortcut, while `c o u c o u` typed in a burst is a sentence
 * meant for Numo. The keyboard provider holds the first printable key for
 * {@link TYPEAHEAD_WINDOW_MS}: a second printable key within that window
 * turns the burst into text for the composer, which takes the focus; no
 * second key replays the held one, and the shortcut runs. Each key is
 * handled once, as text or as a shortcut, never both.
 */
export const TYPEAHEAD_WINDOW_MS = 200;

export interface TypeaheadTarget {
  /** Whether a keystroke on `target` (the focused element) is for this composer. */
  accepts: (target: EventTarget | null) => boolean;
  /** Appends the burst to the composer and focuses it. */
  type: (text: string) => void;
}

const targets: TypeaheadTarget[] = [];

/** The composer a keystroke on `target` may feed, the latest registered first. */
export function typeaheadTargetFor(target: EventTarget | null): TypeaheadTarget | null {
  for (let index = targets.length - 1; index >= 0; index -= 1) {
    if (targets[index].accepts(target)) return targets[index];
  }
  return null;
}

/** A key that may open a burst: a letter or a digit, without a command modifier. */
export function startsTypeahead(event: KeyboardEvent): boolean {
  return continuesTypeahead(event) && /^[\p{L}\p{N}]$/u.test(event.key);
}

/** A key that extends a burst: any single printable character, space included. */
export function continuesTypeahead(event: KeyboardEvent): boolean {
  return typeof event.key === "string" && [...event.key].length === 1 &&
    !event.metaKey && !event.ctrlKey && !event.altKey && !event.isComposing && !event.repeat;
}

/** Registers `target` while it is not null (the composer is shown and active). */
export function useTypeaheadTarget(target: TypeaheadTarget | null): void {
  const latest = useRef(target);
  latest.current = target;
  const enabled = target !== null;
  useEffect(() => {
    if (!enabled) return;
    const entry: TypeaheadTarget = {
      accepts: (eventTarget) => latest.current?.accepts(eventTarget) ?? false,
      type: (text) => latest.current?.type(text),
    };
    targets.push(entry);
    return () => {
      const index = targets.indexOf(entry);
      if (index >= 0) targets.splice(index, 1);
    };
  }, [enabled]);
}
