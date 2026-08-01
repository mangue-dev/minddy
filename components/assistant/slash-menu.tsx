"use client";

// Le menu des commandes « / » du composer de Numo — le frère jumeau de la
// liste de mentions (mention-suggest), pour les Skills : taper « / » en début
// de message ouvre la liste, choisir pose la commande en pilule dans le texte.

import type { LucideIcon } from "lucide-react";
import { cn } from "mangue-ui";
import type { AssistantCommandId } from "@/lib/assistant-types";

export interface SlashCommandOption {
  id: AssistantCommandId;
  /** Ce qui s'écrit après le « / » — localisé (« create issue » / « créer ticket »). */
  label: string;
  /** Ce que la commande fait, en une ligne, sous le libellé. */
  description: string;
  icon: LucideIcon;
  /** Termes de recherche en plus du libellé (l'alias de l'autre langue). */
  keywords?: string[];
}

/** Les commandes qui correspondent à la requête tapée après le « / ». */
export function filterCommands(
  options: SlashCommandOption[],
  query: string,
): SlashCommandOption[] {
  const q = query.trim().toLowerCase();
  return options.filter((o) =>
    q
      ? [o.label, ...(o.keywords ?? [])].some((term) =>
          term.toLowerCase().includes(q),
        )
      : true,
  );
}

export function SlashMenu({
  options,
  activeIndex,
  onPick,
  onHover,
  className,
}: {
  options: SlashCommandOption[];
  activeIndex: number;
  onPick: (option: SlashCommandOption) => void;
  onHover: (index: number) => void;
  className?: string;
}) {
  if (options.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute bottom-full z-50 mb-1 max-h-56 w-72 overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-md",
        className,
      )}
    >
      {options.map((option, index) => (
        <button
          key={option.id}
          type="button"
          // mousedown, pas click : le composer ne doit pas perdre le focus (le
          // blur fermerait la liste avant que le clic n'arrive).
          onMouseDown={(e) => {
            e.preventDefault();
            onPick(option);
          }}
          onMouseEnter={() => onHover(index)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm",
            index === activeIndex && "bg-muted",
          )}
        >
          <option.icon className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate">/{option.label}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {option.description}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
