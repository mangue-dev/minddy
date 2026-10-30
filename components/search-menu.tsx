"use client";

import { CommandList } from "@/components/ui/command";

// Shared searchable menu: anchored popover on desktop, modal bottom sheet on
// mobile. Field and pointer-anchored pickers share filtering and option state.

import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";
import * as React from "react";
import { useTranslations } from "next-intl";
import { Command as CommandPrimitive, defaultFilter } from "cmdk";
import { issueAwareFilter } from "@/lib/issue-search-order";

/**
 * cmdk's own filter, plus the issue order of MIN-726 for items that carry an
 * issue tier keyword (`issueTierKeyword`): work under way first, closed
 * issues last, an exact identifier before all. Other items score as before.
 */
const searchMenuFilter = issueAwareFilter(defaultFilter);
import { Command, CommandEmpty, CommandSeparator } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { ResponsivePopover, ResponsivePopoverAnchor, ResponsivePopoverContent, ResponsivePopoverTrigger } from "@/components/ui/responsive-popover";
import { Kbd } from "@/components/ui/kbd";
import { PointerAnchor } from "@/components/pointer-anchor";
import { anchorKey, useMountedWhileClosing } from "@/components/ui/overlay-freeze";
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
    <div data-sheet-search className="flex items-center gap-2 px-2 py-1">
      <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 opacity-50" />
      {children}
    </div>
  );
}

export type SearchMenuProps = {
  open: boolean;
  /** Give body-portaled menus their own scroll lock when opened inside a modal. */
  modal?: boolean;
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
  /** The current step of a multi-step menu. When it changes, the search field
   *  takes the focus back: choosing an option with the pointer leaves it on
   *  the popover, and the next step is searched by typing. */
  focusKey?: string | null;
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
  /** Rich boards keep closed popovers unmounted while retaining their trigger. */
  deferTrigger?: boolean;
  /** Where the focus goes once the menu closes; `preventDefault` keeps it off
   *  the trigger (a menu opened by a shortcut while typing returns to the text). */
  onCloseAutoFocus?: (event: Event) => void;
  /** cmdk groups/items (each caller wraps its options in a CommandGroup). */
  children: React.ReactNode;
};

export function SearchMenu({
  open,
  modal,
  onOpenChange,
  trigger,
  position,
  tooltip,
  shortcutHint,
  searchPlaceholder,
  searchValue,
  onSearchValueChange,
  focusKey,
  shouldFilter,
  emptyText,
  hideEmpty,
  align = "start",
  contentClassName,
  container,
  stopPropagation,
  deferTrigger,
  onCloseAutoFocus,
  children,
}: SearchMenuProps) {
  const t = useTranslations("Picker");
  const triggerNode = React.useRef<HTMLElement | null>(null);
  const virtualAnchor = React.useRef({ getBoundingClientRect: () => triggerNode.current?.getBoundingClientRect() ?? new DOMRect() });
  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  // Closed menus stay mounted through their exit animation: at their last
  // point in pointer mode, until it ends in deferred-trigger mode.
  const lastPointer = React.useRef(position ?? null);
  if (position) lastPointer.current = position;
  const pointerMounted = useMountedWhileClosing(open && !!position);
  const deferredMounted = useMountedWhileClosing(open);
  const lastFocusKey = React.useRef(focusKey);
  React.useEffect(() => {
    if (lastFocusKey.current === focusKey) return;
    lastFocusKey.current = focusKey;
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [focusKey, open]);

  const content = (
    <ResponsivePopoverContent
      data-floating-surface
      align={align}
      container={container}
      className={cn("w-60 overflow-hidden rounded-xl p-0", contentClassName)}
      onClick={stop}
      onPointerDown={stop}
      onCloseAutoFocus={onCloseAutoFocus ?? (deferTrigger ? (event) => {
        event.preventDefault();
        triggerNode.current?.focus();
      } : undefined)}
    >
      <Command shouldFilter={shouldFilter} filter={searchMenuFilter}>
        <DropdownSearchRow>
          <CommandPrimitive.Input
            ref={inputRef}
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
    </ResponsivePopoverContent>
  );

  // Pointer-anchored mode: a virtual anchor at the viewport point. Closed
  // (`null`), the menu stays at its last point for its exit animation.
  if (position !== undefined) {
    const anchor = position ?? lastPointer.current;
    if (!pointerMounted || !anchor) return null;
    return (
      <ResponsivePopover key={anchorKey(anchor)} open={open && !!position} onOpenChange={onOpenChange} modal={modal}>
        <PointerAnchor position={anchor} />
        {content}
      </ResponsivePopover>
    );
  }

  if (deferTrigger && React.isValidElement<React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement>; "data-state"?: string }>(trigger)) {
    const props = trigger.props;
    return <Tooltip open={tooltip ? undefined : false}>
      <TooltipTrigger asChild>{React.cloneElement(trigger, {
        ref: (node) => {
          triggerNode.current = node;
          if (typeof props.ref === "function") props.ref(node);
          else if (props.ref) props.ref.current = node;
        },
        "aria-haspopup": "dialog",
        "aria-expanded": open,
        "data-state": open ? "open" : "closed",
        onClick: (event) => {
          props.onClick?.(event);
          if (!event.defaultPrevented) onOpenChange(!open);
        },
        onKeyDown: (event) => {
          props.onKeyDown?.(event);
          if (!event.defaultPrevented && event.key === "ArrowDown") {
            event.preventDefault();
            onOpenChange(true);
          }
        },
      })}</TooltipTrigger>
      {deferredMounted && <ResponsivePopover open={open} onOpenChange={onOpenChange} modal={modal}>
        <ResponsivePopoverAnchor virtualRef={virtualAnchor} />
        {content}
      </ResponsivePopover>}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltip}
        {shortcutHint && <Kbd size="sm">{shortcutHint}</Kbd>}
      </TooltipContent>
    </Tooltip>;
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
    <ResponsivePopover open={open} onOpenChange={onOpenChange} modal={modal}>
      <ResponsivePopoverTrigger asChild>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      </ResponsivePopoverTrigger>
      {content}
    </ResponsivePopover>
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
