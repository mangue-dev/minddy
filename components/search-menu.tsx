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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";
import { Kbd } from "@/components/ui/kbd";

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
  /** Contrôle le texte de recherche. Par défaut cmdk le tient lui-même ; le
   *  passer sert aux menus qui avancent d'une étape à l'autre sans se fermer
   *  (relations : type puis ticket) et doivent repartir d'un champ vide. */
  searchValue?: string;
  onSearchValueChange?: (value: string) => void;
  emptyText?: string;
  /** Cache la ligne « Aucun résultat ». Les menus qui portent une ligne de
   *  création la gardent visible quand rien ne matche : elle EST la réponse,
   *  et un « aucun résultat » juste au-dessus ne dirait rien de plus. */
  hideEmpty?: boolean;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  /** Portal target. Dans un Sheet/Dialog modal, react-remove-scroll bloque la
   *  molette sur tout ce qui est porté à <body> : porter le menu DANS le
   *  panneau est ce qui garde sa liste défilable (le composer de Numo). */
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

  // `rounded-xl` pour la même raison que les combobox : c'est `Command` qui
  // peint cette surface et il s'impose déjà 20px. Les options sont à 8px du bord
  // (le `p-1` de `Command` + celui de `CommandGroup`) et portent 12px —
  // 20 − 8 = 12, concentrique.
  const content = (
    <PopoverContent
      align={align}
      container={container}
      className={cn("w-60 overflow-hidden rounded-xl p-0", contentClassName)}
      onClick={stop}
      onPointerDown={stop}
    >
      <Command>
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
