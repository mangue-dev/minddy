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
import { GENERIC_REASONING_LEVELS, type ReasoningLevel } from "@/lib/agent-reasoning";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Picker du niveau de RAISONNEMENT d'une session d'agent (MIN-122) — le pendant
 * du BranchCombobox, en plus simple : liste courte et FERMÉE, donc pas de champ
 * de recherche ni de saisie libre.
 *
 * CE QU'IL LISTE DÉPEND DU MODÈLE, et ne peut pas ne pas en dépendre : les
 * paliers sont ceux que le modèle choisi publie (`levels`, résolu par
 * `reasoningLevelsFor` chez l'appelant, qui seul sait quel modèle est retenu).
 * Un `gpt-5.1-codex-max` en accepte cinq dont `xhigh`, un `gemini-3` quatre dont
 * `minimal` et sans « sans raisonnement », un Claude n'en publie aucun — on
 * retombe alors sur les quatre historiques. Proposer les sept partout offrirait
 * des choix sans effet ; en proposer trois partout cachait ce que les modèles
 * savent faire.
 *
 * Comme le modèle et la branche, le niveau est choisi au lancement puis FIGÉ pour
 * la session : partout ailleurs, le picker est un chip verrouillé + tooltip.
 *
 * Tous les niveaux sont ouverts à tous, quota minddy compris — l'abonnement est
 * payé, il doit être utilisable en entier. Ce qui borne la dépense est le budget
 * d'usage lui-même, pas une restriction sur le niveau.
 */

const LABEL_KEYS: Record<ReasoningLevel, MessageKey<"Agent">> = {
  off: "reasoningOff",
  minimal: "reasoningMinimal",
  low: "reasoningLow",
  medium: "reasoningMedium",
  high: "reasoningHigh",
  xhigh: "reasoningXhigh",
  max: "reasoningMax",
};

export function ReasoningCombobox({
  value,
  onChange,
  disabled,
  disabledTooltip,
  levels = GENERIC_REASONING_LEVELS,
}: {
  value: ReasoningLevel;
  onChange: (value: ReasoningLevel) => void;
  disabled?: boolean;
  /** Tooltip du chip verrouillé (niveau figé pour la session). */
  disabledTooltip?: string;
  /**
   * Les paliers du modèle choisi (`reasoningLevelsFor`). Absent = les quatre
   * historiques : c'est le repli d'un appelant qui ne sait pas encore quel modèle
   * sera retenu (le catalogue n'est pas arrivé), pas un choix d'affichage.
   */
  levels?: ReasoningLevel[];
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const label = t(LABEL_KEYS[value]);

  // Verrouillé : chip statique + tooltip, SANS popover — le <span> extérieur porte
  // le hover, un bouton `disabled` n'émettant pas d'événement pointer (même
  // montage que le picker de branche et celui de modèle).
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 text-xs font-medium text-foreground/45">
              <Brain className="size-3.5 shrink-0" />
              <span className="whitespace-nowrap">{label}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* `shrink-0` et pas `shrink` : les libellés forment un jeu FERMÉ de sept
          mots courts, dont le plus long (« Sans raisonnement ») tient largement.
          Rien ici ne justifie de rogner — c'est la barre du composer qui
          comprimait le chip. Le nom de modèle à côté, lui, garde sa troncature :
          il est de longueur arbitraire. */}
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={t("reasoning")}
          disabled={disabled}
          className="h-8 shrink-0 gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
        >
          <Brain className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="whitespace-nowrap">{label}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Le nom du palier suffit à le désigner : la liste est courte, ordonnée du
          plus léger au plus lourd, et c'est cet ORDRE qui dit ce qu'ils valent
          les uns par rapport aux autres. Une glose sous chaque ligne rallongeait
          le menu de sept phrases pour redire ça.
          Aucune largeur imposée : `PopoverContent` est déjà `w-max`, donc la
          boîte se dimensionne sur SON contenu. On ne lui donne qu'un plancher,
          pour qu'elle ne se réduise pas à « Léger ». Le `w-72` d'avant, puis le
          `w-48` que j'avais mis, redonnaient l'ellipse qu'on vient d'ôter dès
          qu'une traduction rallonge un palier. */}
      {/* `rounded-xl` : c'est `Command` qui peint la surface et il s'impose déjà
          20px. Avec les 8px de retrait de la liste, les options (12px) sont
          concentriques. */}
      <PopoverContent className="min-w-44 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          {/* `p-1` : mêmes 8px de retrait des QUATRE côtés que les autres
              pickers du composer. */}
          <CommandList className="p-1">
            {levels.map((level) => (
              <CommandItem
                key={level}
                value={level}
                onSelect={() => {
                  onChange(level);
                  setOpen(false);
                }}
              >
                <span className="flex-1 whitespace-nowrap">{t(LABEL_KEYS[level])}</span>
                <Check
                  className={cn("size-4 shrink-0", value === level ? "opacity-100" : "opacity-0")}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
