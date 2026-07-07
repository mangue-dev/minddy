"use client";

// Menu contextuel (clic droit) des cartes de ticket : un cmdk avec recherche
// intégrée, ancré à la position du pointeur (voir CommandAnchor). Générique :
// les actions sont passées par le parent, la liste est prévue pour s'enrichir
// (d'où la recherche dès maintenant).

import * as React from "react";
import { CommandGroup, CommandItem } from "mangue-ui";
import { CommandAnchor } from "@/components/command-anchor";

export interface ContextMenuAction {
  id: string;
  label: string;
  /** Termes de recherche additionnels (synonymes, anglais/français…). */
  keywords?: string[];
  icon?: React.ReactNode;
  /** Touche du raccourci correspondant, affichée en indice (ex. "C"). */
  shortcut?: string;
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
  return (
    <CommandAnchor position={position} onClose={onClose}>
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
            {action.shortcut && (
              <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
                {action.shortcut}
              </kbd>
            )}
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandAnchor>
  );
}
