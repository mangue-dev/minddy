"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Brain, Check, ChevronsUpDown } from "lucide-react";
import {
  Button,
  Command,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "mangue-ui";
import { REASONING_LEVELS, type ReasoningLevel } from "@/lib/agent-reasoning";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Picker du niveau de RAISONNEMENT d'une session d'agent (MIN-122) — le pendant
 * du BranchCombobox, en plus simple : liste courte et FERMÉE (quatre niveaux),
 * donc pas de champ de recherche ni de saisie libre.
 *
 * Comme le modèle et la branche, le niveau est choisi au lancement puis FIGÉ pour
 * la session : partout ailleurs, le picker est un chip verrouillé + tooltip.
 *
 * `high` peut être hors de portée (quota minddy : les tokens de réflexion sont
 * facturés sur le budget mensuel partagé du plan). L'option est alors montrée
 * désactivée plutôt que cachée — l'utilisateur voit qu'elle existe et pourquoi
 * elle ne s'applique pas. La borne est appliquée CÔTÉ SERVEUR
 * (`resolveReasoningLevel`) : ceci n'en est que le reflet.
 */

const LABEL_KEYS: Record<ReasoningLevel, MessageKey<"Agent">> = {
  off: "reasoningOff",
  low: "reasoningLow",
  medium: "reasoningMedium",
  high: "reasoningHigh",
};

const DESC_KEYS: Record<ReasoningLevel, MessageKey<"Agent">> = {
  off: "reasoningOffDesc",
  low: "reasoningLowDesc",
  medium: "reasoningMediumDesc",
  high: "reasoningHighDesc",
};

export function ReasoningCombobox({
  value,
  onChange,
  disabled,
  disabledTooltip,
  maxLevel,
}: {
  value: ReasoningLevel;
  onChange: (value: ReasoningLevel) => void;
  disabled?: boolean;
  /** Tooltip du chip verrouillé (niveau figé pour la session). */
  disabledTooltip?: string;
  /** Niveau le plus élevé atteignable ; au-delà l'option est désactivée. */
  maxLevel?: ReasoningLevel;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const capIndex = maxLevel ? REASONING_LEVELS.indexOf(maxLevel) : REASONING_LEVELS.length - 1;
  const label = t(LABEL_KEYS[value]);

  // Verrouillé : chip statique + tooltip, SANS popover — le <span> extérieur porte
  // le hover, un bouton `disabled` n'émettant pas d'événement pointer (même
  // montage que le picker de branche et celui de modèle).
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground/45">
              <Brain className="size-3.5 shrink-0" />
              <span className="max-w-[9rem] truncate">{label}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={t("reasoning")}
          disabled={disabled}
          className="h-8 shrink gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
        >
          <Brain className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">{label}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command shouldFilter={false}>
          {/* mt-1.5 / px-1 : mêmes retraits que les autres pickers du composer. */}
          <CommandList className="mt-1.5 px-1">
            {REASONING_LEVELS.map((level, i) => {
              const outOfReach = i > capIndex;
              const item = (
                <CommandItem
                  key={level}
                  value={level}
                  disabled={outOfReach}
                  onSelect={() => {
                    if (outOfReach) return;
                    onChange(level);
                    setOpen(false);
                  }}
                  className={cn("items-start gap-2", outOfReach && "opacity-50")}
                >
                  <div className="flex flex-1 flex-col gap-0.5">
                    <span>{t(LABEL_KEYS[level])}</span>
                    <span className="text-xs text-muted-foreground">{t(DESC_KEYS[level])}</span>
                  </div>
                  <Check
                    className={cn(
                      "mt-0.5 size-4 shrink-0",
                      value === level ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              );
              // Hors de portée : dire POURQUOI, sinon l'option grisée est une
              // impasse muette.
              return outOfReach ? (
                <Tooltip key={level}>
                  <TooltipTrigger asChild>
                    <div>{item}</div>
                  </TooltipTrigger>
                  <TooltipContent side="right">{t("reasoningHighByok")}</TooltipContent>
                </Tooltip>
              ) : (
                item
              );
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
