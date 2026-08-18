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
 * Automation Preset Picker (MIN-147) — same mounting as picker
 * level of reasoning of the agent composer: short and CLOSED list, therefore
 * Popover + Command without search box, and each option has its title
 * AND a line that says what it does.
 *
 * It's this line that counts. Choose between “Full Loop” and “Plan and
 * verification only » on the titles only asks to know the feature
 * before using it; with “Frame before, control after.” The code remains
 * You. », the choice is made without leaving the list.
 *
 * The trigger keeps the size of a form field — the round chip
 * of composing chat would not make sense in a settings page —, and the
 * LONG description of the current choice remains below the field: once the list
 * closed, this is the only explanation still visible.
 */

/** `null` = no preset, a choice in its own right (nothing is triggered). */
type PresetValue = AutomationPresetId | null;

const LABEL_KEYS: Record<AutomationPresetId, MessageKey<"Automations">> = {
  "loop-by-effort": "presetLoopByEffort",
  "plan-and-verify": "presetPlanAndVerify",
  "plan-only": "presetPlanOnly",
  "implement-only": "presetImplementOnly",
  "verify-only": "presetVerifyOnly",
};

/** The short line of the LIST — calibrated to those of the reasoning picker. */
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
          {/* mt/mb-1.5 + px-1: same indents as the other pickers of the product.
 `max-h-96` over the default `max-h-72`: six two-line options overhang it, and `CommandList` hides its scrollbar
 (`no-scrollbar`) — the last option was cut off, with no clue to scroll through. The list is short and
 closed: it must fit in full. */}
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
