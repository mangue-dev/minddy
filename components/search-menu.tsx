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
  Kbd,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";

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
  emptyText?: string;
  align?: "start" | "center" | "end";
  contentClassName?: string;
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
  emptyText,
  align = "start",
  contentClassName,
  stopPropagation,
  children,
}: SearchMenuProps) {
  const t = useTranslations("Picker");
  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;

  const content = (
    <PopoverContent
      align={align}
      className={cn("w-60 overflow-hidden p-0", contentClassName)}
      onClick={stop}
      onPointerDown={stop}
    >
      <Command>
        <DropdownSearchRow>
          <CommandPrimitive.Input
            autoFocus
            placeholder={searchPlaceholder ?? t("search")}
            className={searchInputClass}
          />
        </DropdownSearchRow>
        <CommandSeparator className="my-1" />
        <CommandList>
          <CommandEmpty>{emptyText ?? t("noResults")}</CommandEmpty>
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
  const popover = (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltip ? (
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      {content}
    </Popover>
  );

  if (!tooltip) return popover;
  return (
    <Tooltip>
      {popover}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltip}
        {shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}
