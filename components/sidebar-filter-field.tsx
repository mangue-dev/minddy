"use client";

import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "mangue-ui";
import { isTypingTarget } from "@/lib/keyboard/keyboard-context";
import { eventKey } from "@/lib/keyboard/event-key";

/**
 * The filter field in the title line of a secondary sidebar.
 *
 * This is NOT the application search — the header search opens the palette,
 * a modal that searches everywhere and takes you elsewhere. This one reduces the
 * list which is just below, in place, and nothing else. Hence the vocabulary
 * ("Filter the...", never "Search") and the appearance: neither border nor background,
 * the same discrete grammar as the app's filter triggers, not a
 * form field. Two search boxes on the same strip of 60 px, at the
 * two ends of the screen, must not look alike.
 *
 * The placeholder NAMES the list: it is he who takes over the role of the title that we
 * removed from this line (the breadcrumbs wrote it already, 340 px further to the right).
 */
export function SidebarFilterField({
  value,
  onChange,
  placeholder,
  clearLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  /** “Filter pull requests…” — also serves as an accessible label. */
  placeholder: string;
  /** Clear button label (screen reader + hover). */
  clearLabel: string;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // `/` puts the focus here, wherever you are on the page. Only one sidebar
  // secondary is mounted at once, so no ambiguity on the target; the test
  // `offsetParent` excludes the case where it is folded (mobile, open detail),
  // where stealing focus to an invisible field would lead nowhere.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // No guard on `shiftKey`: in AZERTY, “/” TAPES with Shift. It is
      // `e.key` which decides, and it cannot be equal to “/” and “? » at once —
      // the cheat sheet shortcut therefore remains intact.
      if (eventKey(e) !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"]')) return;
      const input = ref.current;
      if (!input || input.offsetParent === null) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      input.focus();
      input.select();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={2} />
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        // `text-base` under md: below 16 px, iOS zooms on the field at
        // focus and never zoom out again.
        className={cn(
          "min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm",
          "placeholder:text-muted-foreground",
        )}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          // The button must not go up: it would close the movable shutter or
          // the parent dialog when we just wanted to empty the filter.
          e.stopPropagation();
          if (value) onChange("");
          else ref.current?.blur();
        }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => {
            onChange("");
            ref.current?.focus();
          }}
          aria-label={clearLabel}
          className="-mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/**
 * The normalization shared by all sidebar filters: lowercase, without
 * accents. “Décor” must be found by typing “decor”, and vice versa.
 */
export function normalizeFilterText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * True if ALL the words in the query are found in one of the fields offered.
 * The words, and not the entire string: "numo auth" must match a PR of which the
 * title bears one and the branch the other.
 */
export function matchesFilter(
  query: string,
  fields: (string | null | undefined)[],
): boolean {
  const words = normalizeFilterText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = normalizeFilterText(
    fields.filter((f): f is string => !!f).join(" "),
  );
  return words.every((w) => haystack.includes(w));
}
