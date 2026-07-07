"use client";

// Menu contextuel (clic droit) des cartes de ticket : un cmdk avec recherche
// intégrée, ancré à la position du pointeur — même coquille que les pickers
// de search-select.tsx. Générique : les actions sont passées par le parent,
// la liste est prévue pour s'enrichir (d'où la recherche dès maintenant).

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "mangue-ui";

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Termes de recherche additionnels (synonymes, anglais/français…). */
  keywords?: string[];
  icon?: React.ReactNode;
  onSelect: () => void;
}

export function IssueContextMenu({
  position,
  onClose,
  actions,
}: {
  /** Coordonnées viewport du clic droit ; null = menu fermé. */
  position: { x: number; y: number } | null;
  onClose: () => void;
  actions: ContextMenuAction[];
}) {
  const t = useTranslations("Picker");
  if (!position) return null;

  return (
    <Popover open onOpenChange={(open) => !open && onClose()}>
      <PopoverAnchor asChild>
        <span
          aria-hidden
          style={{ position: "fixed", left: position.x, top: position.y }}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-60 overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Même ajustement de radius que PickerShell (search-select.tsx). */}
        <Command className="[&_[data-slot=input-group]]:rounded-sm!">
          <CommandInput autoFocus placeholder={t("search")} />
          <CommandList>
            <CommandEmpty>{t("noResults")}</CommandEmpty>
            <CommandGroup>
              {actions.map((action) => (
                <CommandItem
                  key={action.id}
                  value={action.id}
                  keywords={[action.label, ...(action.keywords ?? [])]}
                  onSelect={() => {
                    onClose();
                    action.onSelect();
                  }}
                >
                  {action.icon}
                  <span className="truncate">{action.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
