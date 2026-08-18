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
 * The SPENDING CEILING of a passage — same setup as the level picker of
 * reasoning: short and CLOSED list, therefore no search or entry
 * free, and the same compact pellet as its row neighbors.
 *
 * LAYERS and not one number field: no one has an opinion to the nearest percent,
 * and a free field would require inventing one. What is really decided
 * is within the five — a routine among others, a quarter of the month, the
 * half, the default, or nothing at all.
 *
 * In PERCENTAGE, like everything that speaks of use to the user: the dollars
 * of gross cost only come out on the admin dashboard, and a cap in
 * percentage follows the plan on its own on the day the subscription changes.
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

  /** A cap set elsewhere (MCP, Numo) may not fall on any tier:
 * it is displayed as is, and the list shows it in addition to the five. */
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
      {/* `rounded-xl`: it is `Command` which paints the surface and it already imposes
 20px. With the 8px removal from the list, the options (12px) are concentric. */}
      <PopoverContent className="w-72 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          {/* `p-1`: same 8px indent on ALL FOUR sides. */}
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
