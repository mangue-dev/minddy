"use client";

import { useEffect, useRef } from "react";

/**
 * Places `document.title` while it is mounted, then returns control (MIN-95).
 *
 * A ticket does not have its own URL: it opens in a panel, on `?issue=<id>`.
 * No `generateMetadata` can therefore name it — the search parameters
 * do not reach layouts, and table pages are components
 * customers. However, the tab title remains the only way to find the correct one
 * ticket among five open tabs, hence this detour through the DOM.
 *
 * When disassembled, the original title returns — closing the panel is not a
 * navigation, no one else will put it down. Unless someone changed it
 * in the meantime: that's when Next made the title of a NEW page,
 * which we would be careful not to crush.
 */
export function DocumentTitle({ title }: { title: string }) {
  const original = useRef<string | null>(null);
  const applied = useRef<string | null>(null);

  useEffect(() => {
    original.current ??= document.title;
    document.title = title;
    applied.current = title;
  }, [title]);

  // Empty outbuildings: this cleaning should only take place when dismantling, not when
  // each title change (it would restore the title of the previous ticket).
  useEffect(
    () => () => {
      if (original.current !== null && document.title === applied.current) {
        document.title = original.current;
      }
    },
    [],
  );

  return null;
}
