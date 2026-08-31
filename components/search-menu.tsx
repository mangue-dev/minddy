"use client";

// The single shared shell for every searchable dropdown built on cmdk: the
// field pickers (search-select.tsx, trigger-anchored) and the pointer-anchored
// menus (command-anchor.tsx — field shortcuts, relation target picker). A cmdk
// <Command> inside a Popover, anchored either to a trigger element or to a
// viewport position. The search field (icon + plain input + separator) is the
// same one the right-click context menu uses (see DropdownSearchRow), so all
// searchable dropdowns share one look.

import * as React from "react";
import { useTranslations } from "next-intl";
import { Command as CommandPrimitive } from "cmdk";
import { SearchIcon } from "lucide-react";
import {
  Command,
  CommandEmpty,
  CommandList,
  CommandSeparator,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/** Shared styling for the search input inside any dropdown (cmdk or Radix). */
export const searchInputClass =
  "w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground";

/** The search row (magnifier + input) shared by every searchable dropdown —
 *  the cmdk shell below and the Radix context menu both render it, so the field
 *  looks identical everywhere. Pass the actual input (cmdk or plain) as child. */
export function DropdownSearchRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      {children}
    </div>
  );
}

export type SearchMenuProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Trigger-anchored mode: the element the menu hangs off. */
  trigger?: React.ReactNode;
  /** Pointer-anchored mode: viewport coordinates (mutually exclusive with
   *  `trigger`). `null` renders nothing (closed). */
  position?: { x: number; y: number } | null;
  /** Optional tooltip on the trigger (trigger mode only). */
  tooltip?: string;
  /** Key badge (e.g. "S") shown next to the tooltip — surfaces the shortcut. */
  shortcutHint?: string;
  searchPlaceholder?: string;
  /** Controls search text. By default cmdk holds it itself; THE
 * pass is used for menus which advance from one step to another without closing
 * (relations: type then ticket) and must start from an empty field. */
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  /** Disable cmdk ranking when the caller already filters and orders items. */
  shouldFilter?: boolean;
  emptyText?: string;
  /** Hides the “No results” line. Menus that carry a
 * creation line keep it visible when nothing matches: it IS the answer,
 * and a "no result" just above it would say nothing more. */
  hideEmpty?: boolean;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  /** Portal target. In a Sheet/Dialog modal, react-remove-scroll blocks the
 * scrollbar on anything brought to <body>: bringing the menu INTO the
 * panel is what keeps its list scrollable (Numo's dial it). */
  container?: HTMLElement | null;
  /** Stop pointer/click from bubbling to a draggable/clickable ancestor. */
  stopPropagation?: boolean;
  /** cmdk groups/items (each caller wraps its options in a CommandGroup). */
  children: React.ReactNode;
};

export function SearchMenu({
  open,
  onOpenChange,
  trigger,
  position,
  tooltip,
  shortcutHint,
  searchPlaceholder,
  searchValue,
  onSearchValueChange,
  shouldFilter,
  emptyText,
  hideEmpty,
  align = "start",
  contentClassName,
  container,
  stopPropagation,
  children,
}: SearchMenuProps) {
  const t = useTranslations("Picker");
  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;

  // `rounded-xl` for the same reason as the comboboxes: it is `Command` which
  // paints this surface and it is already 20px. Options are 8px from the edge
  // (the `p-1` of `Command` + that of `CommandGroup`) and carry 12px —
  // 20 − 8 = 12, concentrique.
  const content = (
    <PopoverContent
      align={align}
      container={container}
      className={cn("w-60 overflow-hidden rounded-xl p-0", contentClassName)}
      onClick={stop}
      onPointerDown={stop}
    >
      <Command shouldFilter={shouldFilter}>
        <DropdownSearchRow>
          <CommandPrimitive.Input
            autoFocus
            placeholder={searchPlaceholder ?? t("search")}
            className={searchInputClass}
            {...(searchValue !== undefined
              ? { value: searchValue, onValueChange: onSearchValueChange }
              : {})}
          />
        </DropdownSearchRow>
        <CommandSeparator className="my-1" />
        <CommandList>
          {!hideEmpty && <CommandEmpty>{emptyText ?? t("noResults")}</CommandEmpty>}
          {children}
        </CommandList>
      </Command>
    </PopoverContent>
  );

  // Pointer-anchored mode: a zero-size anchor pinned at the viewport point.
  if (position !== undefined) {
    if (!position) return null;
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{ position: "fixed", left: position.x, top: position.y }}
          />
        </PopoverAnchor>
        {content}
      </Popover>
    );
  }

  // Trigger-anchored mode.
  //
  // ⚠ Only one form, whatever `tooltip` (MIN-313). Wrap
  // conditionally would change the TYPE of the element rendered at that position,
  // and React does not reconcile two different types: it disassembles the subtree,
  // mount a new one, the DOM node is replaced and the focus it carried drops
  // on <body>. None of the ~30 calling sites currently vary `tooltip`
  // at execution - it is therefore a loaded rifle without a trigger, and the first time
  // that we make a `tooltip` conditional, the fault would appear without anything
  // does not link it to this change. What varies here is the OPENING.
  const popover = (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      </PopoverTrigger>
      {content}
    </Popover>
  );

  return (
    <Tooltip open={tooltip ? undefined : false}>
      {popover}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltip}
        {shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
