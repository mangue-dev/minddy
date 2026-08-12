"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, CircleGauge } from "lucide-react";
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

import {
  DEFAULT_MAX_SPEND_PERCENT,
  NO_SPEND_CAP_PERCENT,
  SPEND_CAP_CHOICES,
} from "@/lib/routine-budget";

/**
 * Le PLAFOND DE DÉPENSE d'un passage — même montage que le picker de niveau de
 * raisonnement : liste courte et FERMÉE, donc pas de recherche ni de saisie
 * libre, et la même pastille compacte que ses voisins de rangée.
 *
 * Des PALIERS et pas un champ de nombre : personne n'a d'avis au pourcent près,
 * et un champ libre demanderait d'en inventer un. Ce qui se décide vraiment
 * tient dans les cinq — une routine parmi d'autres, un quart du mois, la
 * moitié, le défaut, ou rien du tout.
 *
 * En POURCENTAGE, comme tout ce qui parle d'usage à l'utilisateur : les dollars
 * de coût brut ne sortent que sur le tableau de bord admin, et un plafond en
 * pourcentage suit le plan tout seul le jour où l'abonnement change.
 */
export function SpendCapCombobox({
  value,
  onChange,
  disabled,
}: {
  /** Part du budget mensuel, 1–100. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("Routines");
  const [open, setOpen] = useState(false);

  /** Un plafond réglé ailleurs (MCP, Numo) peut ne tomber sur aucun palier :
   *  il s'affiche tel quel, et la liste le montre en plus des cinq. */
  const choices = SPEND_CAP_CHOICES.includes(value)
    ? SPEND_CAP_CHOICES
    : [...SPEND_CAP_CHOICES, value].sort((a, b) => a - b);

  const labelFor = (percent: number) =>
    percent >= NO_SPEND_CAP_PERCENT ? t("spendCapNone") : t("spendCapValue", { percent });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={t("spendCapLabel")}
          disabled={disabled}
          className="h-8 shrink gap-1.5 rounded-full border border-border/60 bg-muted/50 px-2.5 text-xs font-medium text-foreground/80 hover:bg-muted"
        >
          <CircleGauge className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="max-w-[9rem] truncate">{labelFor(value)}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* `rounded-xl` : c'est `Command` qui peint la surface et il s'impose déjà
          20px. Avec les 8px de retrait de la liste, les options (12px) sont
          concentriques. */}
      <PopoverContent className="w-72 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          {/* `p-1` : mêmes 8px de retrait des QUATRE côtés. */}
          <CommandList className="p-1">
            {choices.map((percent) => (
              <CommandItem
                key={percent}
                value={String(percent)}
                onSelect={() => {
                  onChange(percent);
                  setOpen(false);
                }}
                className="items-start gap-2"
              >
                <div className="flex flex-1 flex-col gap-0.5">
                  <span>{labelFor(percent)}</span>
                  <span className="text-xs text-muted-foreground">
                    {percent >= NO_SPEND_CAP_PERCENT
                      ? t("spendCapNoneDesc")
                      : percent === DEFAULT_MAX_SPEND_PERCENT
                        ? t("spendCapDefaultDesc")
                        : t("spendCapValueDesc", { percent })}
                  </span>
                </div>
                <Check
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    value === percent ? "opacity-100" : "opacity-0",
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
