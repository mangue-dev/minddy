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
} from "mangue-ui";
import { GENERIC_REASONING_LEVELS, type ReasoningLevel } from "@/lib/agent-reasoning";
import type { MessageKey } from "@/lib/i18n-keys";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Picker of the REASONING level of an agent session (MIN-122) — the counterpart
 * of the BranchCombobox, simpler: short and CLOSED list, therefore no field
 * de recherche ni de saisie libre.
 *
 * WHAT IT LISTS DEPENDS ON THE MODEL, and cannot not depend on it: the
 * levels are those that the chosen model publishes (`levels`, resolved by
 * `reasoningLevelsFor` at the caller, who alone knows which model is chosen).
 * Un `gpt-5.1-codex-max` en accepte cinq dont `xhigh`, un `gemini-3` quatre dont
 * `minimal` and without “without reasoning”, a Claude does not publish any — we
 * then falls back on the four histories. Proposing the seven everywhere would offer
 * choices without effect; offering three everywhere hid what the models
 * savent faire.
 *
 * Like the model and the branch, the level is chosen at launch then FROZEN for
 * the session: everywhere else, the picker is a locked chip + tooltip.
 *
 * All levels are open to everyone, minddy quota included — subscription is
 * paid, it must be usable in its entirety. What limits the expense is the budget
 * of use itself, not a restriction on the level.
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
  variant = "compact",
}: {
  value: ReasoningLevel;
  onChange: (value: ReasoningLevel) => void;
  disabled?: boolean;
  /** Tooltip of the locked chip (frozen level for the session). */
  disabledTooltip?: string;
  /**
   * The levels of the chosen model (`reasoningLevelsFor`). Absent = all four
   * historical: it is the withdrawal of a caller who does not yet know which model
   * will be retained (the catalog has not arrived), not a choice of display.
   */
  levels?: ReasoningLevel[];
  /** Full width field, for forms that place it below the template. */
  variant?: "compact" | "field";
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const label = t(LABEL_KEYS[value]);

  // Locked: static chip + tooltip, WITHOUT popover — the exterior <span> door
  // the hover, a `disabled` button not emitting a pointer event (even
  // assembly as the branch picker and the model picker).
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">
            <span className="pointer-events-none flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-transparent bg-transparent px-1.5 text-xs font-medium text-foreground/45">
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
      {/* `shrink-0` and not `shrink`: the labels form a CLOSED set of seven
 short words, the longest of which ("Without reasoning") fits well.
 Nothing here justifies cutting back — it's the composer's bar which
 was compressing the chip. The model name next to it keeps its truncation:
 it is of arbitrary length. */}
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          role="combobox"
          aria-expanded={open}
          aria-label={t("reasoning")}
          disabled={disabled}
          className={cn(
            "gap-1.5 text-xs font-medium text-foreground/80",
            variant === "field"
              ? "h-10 w-full justify-start rounded-md border border-input bg-transparent px-3 text-left hover:bg-muted/50"
              : "h-8 shrink-0 rounded-full border border-transparent bg-transparent px-1.5 hover:bg-muted/50",
          )}
        >
          <Brain className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="whitespace-nowrap text-left">{label}</span>
          <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* The name of the level is enough to designate it: the list is short, ordered from
 lightest to heaviest, and it is this ORDER which says what they are worth
 in relation to each other. A gloss under each line extended
 the menu by seven sentences to repeat that.
 No imposed width: `PopoverContent` is already `w-max`, so the
 box is sized on ITS contents. We only give it a floor,
 so that it is not reduced to “Light”. The `w-72` from before, then the
 `w-48` that I had put, gave back the ellipse that we have just removed as soon as a translation extends a level. */}
      {/* `rounded-xl`: it is `Command` which paints the surface and it is already imposed
 20px. With the 8px removal from the list, the options (12px) are concentric. */}
      <PopoverContent className="min-w-44 rounded-xl p-0" align="start">
        <Command shouldFilter={false}>
          {/* `p-1`: same 8px indentation on FOUR sides as the others
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
