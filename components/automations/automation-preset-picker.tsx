"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Workflow } from "lucide-react";
import {
  Button,
  Command,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "mangue-ui";
import { AUTOMATION_PRESET_IDS, type AutomationPresetId } from "@/lib/automations";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * Picker de préréglage d'automatisation (MIN-147) — même montage que le picker
 * de niveau de raisonnement du composer d'agent : liste courte et FERMÉE, donc
 * Popover + Command sans champ de recherche, et chaque option porte son titre
 * ET une ligne qui dit ce qu'elle fait.
 *
 * C'est cette ligne qui compte. Choisir entre « Boucle complète » et « Plan et
 * vérification seulement » sur les seuls titres demande de connaître la feature
 * avant de s'en servir ; avec « Cadre avant, contrôle après. Le code reste à
 * toi. », le choix se fait sans quitter la liste.
 *
 * Le déclencheur, lui, garde la taille d'un champ de formulaire — le chip rond
 * du composer de chat n'aurait pas de sens dans une page de réglages —, et la
 * description LONGUE du choix courant reste sous le champ : une fois la liste
 * refermée, c'est la seule explication encore visible.
 */

/** `null` = aucun préréglage, un choix à part entière (rien ne se déclenche). */
type PresetValue = AutomationPresetId | null;

const LABEL_KEYS: Record<AutomationPresetId, MessageKey<"Automations">> = {
  "loop-by-effort": "presetLoopByEffort",
  "plan-and-verify": "presetPlanAndVerify",
  "plan-only": "presetPlanOnly",
  "implement-only": "presetImplementOnly",
  "verify-only": "presetVerifyOnly",
};

/** La ligne courte de la LISTE — calibrée sur celles du picker de raisonnement. */
const SHORT_KEYS: Record<AutomationPresetId, MessageKey<"Automations">> = {
  "loop-by-effort": "presetLoopByEffortShort",
  "plan-and-verify": "presetPlanAndVerifyShort",
  "plan-only": "presetPlanOnlyShort",
  "implement-only": "presetImplementOnlyShort",
  "verify-only": "presetVerifyOnlyShort",
};

export function AutomationPresetPicker({
  value,
  onChange,
  disabled,
}: {
  value: PresetValue;
  onChange: (value: PresetValue) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Automations");
  const [open, setOpen] = useState(false);

  const options: { key: string; value: PresetValue; label: string; short: string }[] = [
    { key: "none", value: null, label: t("presetNone"), short: t("presetNoneShort") },
    ...AUTOMATION_PRESET_IDS.map((id) => ({
      key: id,
      value: id as PresetValue,
      label: t(LABEL_KEYS[id]),
      short: t(SHORT_KEYS[id]),
    })),
  ];
  const current = options.find((o) => o.value === value) ?? options[0];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={t("presetTitle")}
          disabled={disabled}
          className="h-9 w-full max-w-sm justify-between gap-2 font-normal"
        >
          <span className="flex min-w-0 items-center gap-2">
            <Workflow className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{current.label}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          {/* mt/mb-1.5 + px-1 : mêmes retraits que les autres pickers du produit.
              `max-h-96` par-dessus le `max-h-72` par défaut : six options à deux
              lignes le dépassent, et `CommandList` masque sa barre de défilement
              (`no-scrollbar`) — la dernière option se retrouvait coupée, sans
              aucun indice qu'il fallait faire défiler. La liste est courte et
              fermée : elle doit tenir en entier. */}
          <CommandList className="mt-1.5 mb-1.5 max-h-96 px-1">
            {options.map((option) => (
              <CommandItem
                key={option.key}
                value={option.key}
                onSelect={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="items-start gap-2"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-xs text-muted-foreground">{option.short}</span>
                </div>
                <Check
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    option.value === value ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
