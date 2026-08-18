"use client";

// The one-page floating TABLE OF CONTENTS.
//
// It is placed at the top right of the panel, out of the flow and out of the
// scroll, and it is read at two distances: at rest, a pile of TRAITS
// whose length indicates the level of the title and whose position indicates where we are
// East ; on hover, a bordered panel which bears the titles themselves, and more
// single line. This is Notion's gesture, and what makes it good is precisely this
// qu'il ne fait pas au repos — il ne prend pas de place, il ne prend pas de
// name, it does not ask to be read.
//
// Clicking goes there AND turns the block back on: after scrolling, nothing distinguishes the
// title that we asked for from our neighbors who arrived on the screen at the same time.
//
// She says nothing when there is nothing to say: under two titles, a page is
// browses by eye, and a one-line table of contents is an ornament.
//
// Where do the titles come from: from the STATE ProseMirror, not from the DOM. It's the same
// source as the saved document, so it cannot describe a page
// which no longer exists; and it follows the strike without us having to observe anything
// let it be. The DOM only serves one purpose here, to measure — where is this title at
// the screen, and where should you scroll to get it there.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { useTranslations } from "next-intl";
import type { Editor } from "@tiptap/core";
import { cn } from "mangue-ui";
import { revealBlock } from "@/components/pages/block-actions";
import { readHeadings, sameHeadings, type TocEntry } from "@/lib/pages-toc";

/** Below, the table does not appear: see the header. */
const MIN_HEADINGS = 2;

/** Longueur du trait au repos, par niveau de titre. */
const DASH_WIDTH: Record<number, string> = { 1: "w-4", 2: "w-3", 3: "w-2" };

/** Removing the unfolded title, by level. */
const INDENT: Record<number, string> = { 1: "pl-0", 2: "pl-3", 3: "pl-6" };

/** Margin above the target title, once the scrolling is finished. */
const SCROLL_MARGIN = 24;

function headingElement(editor: Editor, pos: number): HTMLElement | null {
  if (editor.isDestroyed || pos > editor.state.doc.content.size) return null;
  const dom = editor.view.nodeDOM(pos);
  return dom instanceof HTMLElement ? dom : null;
}

export function PageToc({
  editor,
  scrollRef,
}: {
  editor: Editor | null;
  /** The moving container — the one we measure, and the one we move. */
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("Pages");
  const [entries, setEntries] = useState<TocEntry[]>([]);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!editor) return;
    const read = () => {
      const next = readHeadings(editor.state.doc);
      setEntries((current) => (sameHeadings(current, next) ? current : next));
    };
    read();
    editor.on("update", read);
    return () => {
      editor.off("update", read);
    };
  }, [editor]);

  // Where we are: the last title passed above the fold.
  // Measured by scrolling rather than by an intersection observer, because
  // the question is not "which titles are visible" (they can be visible
  // three, or zero on a long section) but "which one am I trying to
  // read”, and this response is always defined.
  useEffect(() => {
    // `scrollRef` is read INTO the effect: at first rendering it is still empty (the
    // container is painted after), and it is the passage from zero to N titles which
    // replay this effect, once the editor is mounted.
    const root = scrollRef.current;
    if (!editor || !root || entries.length < MIN_HEADINGS) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const line = root.getBoundingClientRect().top + SCROLL_MARGIN * 3;
      let current = entries[0].pos;
      for (const entry of entries) {
        const element = headingElement(editor, entry.pos);
        if (element && element.getBoundingClientRect().top <= line) {
          current = entry.pos;
        }
      }
      setActive(current);
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(measure);
    };
    measure();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [editor, scrollRef, entries]);

  /* ── The blink of the block reached ────────────────────────── ──────────
 Arriving at the right place is not enough: once the scrolling is finished, nothing on the screen says WHICH of the visible titles we requested. `revealBlock` is
 exactly what the anchor of a block link uses — same gesture, same
 signal, and not a second vocabulary to say the same thing.
 We keep something to cancel it: without it, the timer of the previous click
 would turn off the block we just turned on. */
  const unflash = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      unflash.current?.();
    },
    []
  );

  const goTo = useCallback(
    (pos: number) => {
      const container = scrollRef.current;
      if (!editor || !container) return;
      // Go there AND turn it on: `revealBlock` holds the two together, and says
      // why the scrolling there is DRY — a blink played for a
      // soft scrolling is a blink that no one sees.
      //
      // The margin is counted from the top of the container, not by
      // `scrollIntoView`: this sticks the title to the top edge, under the thread
      // of Ariane and the registration status pinned to it.
      unflash.current?.();
      unflash.current = revealBlock(editor, container, pos, SCROLL_MARGIN);
    },
    [editor, scrollRef]
  );

  if (entries.length < MIN_HEADINGS) return null;

  return (
    /* TWO LAYERS superimposed, and this is what allows you to animate without jumping.
 The folded lines and the unfolded panel do not have the same pitch, nor the same
 width, nor the same line height. As long as they were only ONE
 stack, switching from one to the other meant animating one geometry against
 another: the lines left along the way, and caught up again when closing. Stacked at the same top edge, each keeps its own layout on the
 page — nothing is recalculated, and all that remains is a crossfade,
 which cannot jump.

 The envelope is `pointer-events-none`: it measures the width of the
 panel, and without that it would intercept the clicks of the document on sixteen
 centimeters of space. Only the VISIBLE layers take the mouse again.
 Hovering still goes up to here — that's what unfolds. */
    <div
      className={cn(
        // ANCHORED AT THE TOP, and not centered: a centered table moves at
        // the eye when the window changes height, and on a long page it
        // ends in the middle of the text rather than at the top of what we read.
        "group/toc pointer-events-none absolute top-20 right-2 z-10 w-64",
        // Under `lg`, the text column and table would compete for the same
        // place: it disappears rather than going over the document.
        "hidden lg:block"
      )}
    >
      {/* AT REST — the silhouette of the document. The strokes are the only thing on the screen, and the tight pitch (10 px) is what makes them read like a silhouette rather than a list. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-auto ml-auto flex w-10 flex-col items-end py-1.5 pr-1.5",
          // A page of a hundred titles should not cause the lines to run across
          // full height: the silhouette is cut, it does not scroll.
          "max-h-[70vh] overflow-hidden",
          "transition-opacity duration-200 ease-out",
          "group-hover/toc:pointer-events-none group-hover/toc:opacity-0",
          "group-focus-within/toc:pointer-events-none group-focus-within/toc:opacity-0"
        )}
      >
        {entries.map((entry) => (
          <span key={entry.pos} className="flex h-2.5 items-center">
            <span
              className={cn(
                "h-0.5 rounded-full transition-colors",
                DASH_WIDTH[Math.min(entry.level, 3)],
                entry.pos === active ? "bg-foreground/70" : "bg-foreground/25"
              )}
            />
          </span>
        ))}
      </div>

      {/* ON HOVER — the panel, placed on top, at the same high edge. It enters
 a hair to the left: the movement tells where it comes from, without
neither of the two layers having to reorganize itself. */}
      <nav
        aria-label={t("tableOfContents")}
        className={cn(
          "absolute top-0 right-0 w-64",
          "scrollbar-quiet flex max-h-[70vh] flex-col overflow-y-auto",
          // 12 px radius, 6 px padding: the CONCENTRIC radius of a
          // line is therefore 6 px (`rounded-md` lower). A free value
          // would make two curves that don't fit together.
          // `bg-popover/95` already hides everything: the blur was GPU work
          // for an effect that we cannot see (MIN-323).
          "rounded-xl border border-border bg-popover/95 p-1.5 shadow-lg",
          "pointer-events-none translate-x-1 opacity-0",
          "transition-[opacity,transform] duration-200 ease-out",
          "group-hover/toc:pointer-events-auto group-hover/toc:translate-x-0 group-hover/toc:opacity-100",
          "group-focus-within/toc:pointer-events-auto group-focus-within/toc:translate-x-0 group-focus-within/toc:opacity-100"
        )}
      >
        {entries.map((entry) => {
          const current = entry.pos === active;
          const level = Math.min(entry.level, 3);
          return (
            <button
              key={entry.pos}
              type="button"
              onClick={() => goTo(entry.pos)}
              title={entry.text}
              className={cn(
                "flex h-7 w-full shrink-0 items-center rounded-md px-2 outline-none",
                "transition-colors hover:bg-muted",
                "focus-visible:ring-2 focus-visible:ring-ring"
              )}
            >
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left text-[13px] font-medium",
                  // The withdrawal says the hierarchy here, where at rest it is the
                  // length of the line that says it.
                  INDENT[level],
                  current ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {entry.text}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
