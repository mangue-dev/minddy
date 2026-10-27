"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { NO_SPEND_CAP_PERCENT, SPEND_CAP_CHOICES } from "@/lib/routine-budget";

/**
 * The SPENDING CEILING of a run: the settings' own select, on a short closed
 * list. Tiers rather than a number field: no one has an opinion to the
 * nearest percent. In PERCENTAGE, like everything that speaks of usage to the
 * user: a cap in percent follows the plan on its own when it changes.
 */
export function SpendCapSelect({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id?: string;
  /** Share of the monthly budget, 1–100. */
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  className?: string;
}) {
  const t = useTranslations("Routines");
  // A cap set elsewhere (MCP, Numo) may fall between the tiers: listed too.
  const choices = SPEND_CAP_CHOICES.includes(value)
    ? SPEND_CAP_CHOICES
    : [...SPEND_CAP_CHOICES, value].sort((a, b) => a - b);
  const labelFor = (percent: number) =>
    percent >= NO_SPEND_CAP_PERCENT ? t("spendCapNone") : t("spendCapValue", { percent });

  return (
    <Select value={String(value)} onValueChange={(next) => onChange(Number(next))} disabled={disabled}>
      <SelectTrigger id={id} aria-label={t("spendCapLabel")} className={cn("w-44 shrink-0", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {choices.map((percent) => (
          <SelectItem key={percent} value={String(percent)}>
            {labelFor(percent)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
