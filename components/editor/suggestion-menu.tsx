"use client";

// The frame of every typed-trigger menu: the "/" blocks and "@" mentions of
// the shared editor, the routine "$" skills and the Numo composer's "@". Its
// items sit in sections under a small muted header, and a "Close menu" row
// stays under the list, separated from it: the list scrolls above it, it
// never scrolls away.
//
// The frame draws; the menus own their items, their highlight and their
// keyboard (lib/suggestion-menu.ts holds the shared walk, where the close row
// is the index after the last item).

import { useEffect, type ReactNode, type Ref } from "react";
import { useMenuScrollFade, useMergedRef } from "@/components/ui/menu-scroll-fade";
import { useEscapeLayer } from "@/lib/escape-layers";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { SuggestionSection } from "@/lib/suggestion-menu";
import {
  MENU_ROW_ACTIVE_CLASS,
  MENU_ROW_CLASS,
  MENU_SCROLL_CLASS,
  MENU_SURFACE_CLASS,
} from "@/components/ui/menu-surface";

/** Marks the close row, for the scroll-into-view of the keyboard walk. */
export const SUGGESTION_CLOSE_ATTR = "data-suggestion-close";

/** A section's header: muted, small, and never a row the keyboard reaches. */
export function SuggestionSectionHeader({ label, first }: { label: string; first: boolean }) {
  return (
    <div
      role="presentation"
      data-suggestion-section
      className={cn("px-2 pb-1 text-xs font-medium text-muted-foreground", first ? "pt-0.5" : "pt-2.5")}
    >
      {label}
    </div>
  );
}

/**
 * "Close menu", with its "esc" hint. Picking it closes the menu and leaves
 * what was typed as plain text, like Escape. `mousedown` is prevented so the
 * editor keeps the focus (and the caret) through the click.
 */
export function SuggestionCloseRow({
  active,
  onPick,
  onHover,
  quiet = false,
}: {
  active: boolean;
  onPick: () => void;
  onHover: () => void;
  /** During a keyboard walk the pointer paints nothing (see the "/" menu). */
  quiet?: boolean;
}) {
  const t = useTranslations("Picker");
  return (
    <button
      type="button"
      {...{ [SUGGESTION_CLOSE_ATTR]: "" }}
      aria-selected={active}
      onMouseDown={(event) => event.preventDefault()}
      onMouseMove={(event) => {
        if (event.movementX !== 0 || event.movementY !== 0) onHover();
      }}
      onClick={onPick}
      className={cn(
        MENU_ROW_CLASS,
        "text-foreground",
        active && MENU_ROW_ACTIVE_CLASS,
        quiet && "pointer-events-none",
      )}
    >
      <span className="min-w-0 flex-1 truncate">{t("closeMenu")}</span>
      <span className="shrink-0 text-xs text-muted-foreground">esc</span>
    </button>
  );
}

/** The menu: sectioned list on top, the close row under it. */
export function SuggestionMenu<T>({
  sections,
  sectionLabel,
  renderItem,
  closeActive,
  onClose,
  onCloseHover,
  quiet = false,
  listRef,
  className,
  listClassName,
  closeWhenEmpty = false,
  trailing,
}: {
  sections: SuggestionSection<T>[];
  /** The header of a section; null draws none (items without a section). */
  sectionLabel: (id: string) => string | null;
  /** One row; `index` is its place in the flat list the keyboard walks. */
  renderItem: (item: T, index: number) => ReactNode;
  closeActive: boolean;
  onClose: () => void;
  onCloseHover: () => void;
  quiet?: boolean;
  listRef?: Ref<HTMLDivElement>;
  className?: string;
  /** The list's own height limit: the close row is outside it. */
  listClassName?: string;
  /** A typed query that matches nothing ends the menu, as “Close menu”
      does: true once the query is not empty and no search by meaning is
      still in flight (its answer may yet bring rows). */
  closeWhenEmpty?: boolean;
  /** After the sections, inside the scrolling list (a search status). */
  trailing?: ReactNode;
}) {
  const hasItems = sections.some((section) => section.items.length > 0);
  const exhausted = closeWhenEmpty && !hasItems;
  useEffect(() => {
    if (exhausted) onClose();
  }, [exhausted, onClose]);
  // Escape in the menu closes the menu, not the dialog or panel around it.
  useEscapeLayer(true, onClose);
  // Rows hidden past an edge fade out there, under a chevron.
  const fade = useMenuScrollFade<HTMLDivElement>();
  const scrollRef = useMergedRef(listRef, fade.ref);
  let headers = 0;
  return (
    <div
      data-floating-surface
      // The padding moves onto the scroller, so rows scroll right to the
      // surface's edge and keep its padding once brought into view.
      className={cn("flex flex-col overflow-hidden", MENU_SURFACE_CLASS, "p-0", className)}
    >
      <div
        ref={scrollRef}
        role="listbox"
        onScroll={fade.onScroll}
        className={cn("scrollbar-quiet min-h-0 p-2", MENU_SCROLL_CLASS, listClassName)}
      >
        {fade.start}
        {sections.map((section) => {
          const label = section.id === null ? null : sectionLabel(section.id);
          const first = headers === 0 && section.start === 0;
          if (label) headers += 1;
          return (
            <div key={section.id ?? "none"} role="group" aria-label={label ?? undefined}>
              {label && <SuggestionSectionHeader label={label} first={first} />}
              {section.items.map((item, offset) => renderItem(item, section.start + offset))}
            </div>
          );
        })}
        {trailing}
        {fade.end}
      </div>
      <div className="shrink-0 border-t border-border-subtle p-2">
        <SuggestionCloseRow active={closeActive} onPick={onClose} onHover={onCloseHover} quiet={quiet} />
      </div>
    </div>
  );
}
