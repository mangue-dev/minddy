"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckIcon } from "@hugeicons/core-free-icons";

import { commandFilter } from "@/lib/command-filter";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Command, CommandInput, CommandItem, CommandList } from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { Spinner } from "./spinner";
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip";

/**
 * The searchable single-choice picker of the AI toolbars — model, branch,
 * reasoning level. One shape, two dresses:
 *
 *  • `field` — a full-width form-field trigger (a settings page).
 *  • `compact` — a small rounded pill (the composer's toolbar).
 *
 * Three behaviours are the reason this exists rather than a bare <Select>:
 *  1. It scores its own results (`commandFilter`, `shouldFilter={false}`) and
 *     truncates to `MAX_RESULTS`, so a 400-model catalogue stays usable.
 *  2. Options can be `disabled` — greyed but READABLE. Knowing a model exists
 *     and what it costs is precisely what gives a reason to upgrade; hiding it
 *     says nothing. `footer` carries the explanation (a disabled row emits no
 *     pointer event, so a per-row tooltip is impossible).
 *  3. `disabled` + `disabledTooltip` renders a LOCKED CHIP instead of the
 *     popover — a choice frozen for the session.
 */

const MAX_RESULTS = 50;

export interface ComboboxOption {
  value: string;
  label: string;
  /** Leading visual (a provider logo, a branch icon…). */
  icon?: React.ReactNode;
  /** Trailing aside (a cost multiplier, a "default" hint…). */
  trailing?: React.ReactNode;
  /** Secondary line under the label (a level description). */
  description?: React.ReactNode;
  /** Greyed but still readable and still listed — see the note above. */
  disabled?: boolean;
  /** Extra search terms beyond `label` and `value`. */
  keywords?: string[];
}

export interface ComboboxProps {
  /** Selected option value. `""` means "follow the default option". */
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  /**
   * A pinned first row that clears the choice back to a default (`value: ""`).
   * Its `disabled` is ignored — an app never refuses its own default.
   */
  defaultOption?: Omit<ComboboxOption, "value" | "disabled">;
  /**
   * Allows using the typed text as the value — required for a generic provider
   * whose catalogue may be empty or unavailable. Returns the row's label.
   */
  freeTextLabel?: (query: string) => string;
  variant?: "field" | "compact";
  /** Leading visual of the trigger when nothing else supplies one. */
  triggerIcon?: React.ReactNode;
  /**
   * Overrides what the trigger reads. Use it when following a default should
   * still name the thing it RESOLVES to ("Claude Opus 5") rather than the
   * default row's own wording ("My default model").
   */
  triggerLabel?: React.ReactNode;
  /** Trigger text when `value` is empty and there is no `defaultOption`. */
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  /** Note pinned under the list, outside the scroll (e.g. why rows are grey). */
  footer?: React.ReactNode;
  disabled?: boolean;
  /**
   * With `disabled`, renders a locked chip carrying this tooltip instead of an
   * inert trigger — "to change it, start a new run".
   */
  disabledTooltip?: React.ReactNode;
  /** Width of the popover in `compact` variant. Defaults to `w-80`. */
  contentClassName?: string;
  className?: string;
  "aria-label"?: string;
}

/** The trigger's look, shared by the live button and the locked chip. */
const COMPACT_CHIP =
  "flex h-8 shrink items-center gap-1.5 rounded-full px-2.5 font-sans text-xs font-medium focus-visible:outline-none focus-visible:ring-0";

export function Combobox({
  value,
  onChange,
  options,
  defaultOption,
  freeTextLabel,
  variant = "field",
  triggerIcon,
  triggerLabel: triggerLabelProp,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyLabel = "No results",
  loading = false,
  loadingLabel = "Loading…",
  footer,
  disabled,
  disabledTooltip,
  contentClassName,
  className,
  "aria-label": ariaLabel,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const results = React.useMemo(() => {
    const q = query.trim();
    if (!q) return options.slice(0, MAX_RESULTS);
    return options
      .map((o) => ({
        o,
        score: commandFilter(
          [o.label, o.value, ...(o.keywords ?? [])].join(" "),
          q,
        ),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_RESULTS)
      .map((r) => r.o);
  }, [options, query]);

  const selected = value ? options.find((o) => o.value === value) : undefined;
  const trimmed = query.trim();
  const showFreeText =
    !!freeTextLabel &&
    trimmed.length > 0 &&
    !options.some((o) => o.value === trimmed);

  const select = (next: string) => {
    onChange(next);
    setQuery("");
    setOpen(false);
  };

  /** What the trigger shows: the selection, else the default, else nothing. */
  const triggerIconNode = selected?.icon ?? defaultOption?.icon ?? triggerIcon;
  const triggerLabel =
    triggerLabelProp ??
    selected?.label ??
    (value || defaultOption?.label) ??
    placeholder;

  // Locked (a choice frozen for the session): a static chip + tooltip, with NO
  // popover. The outer <span> carries the hover — a `disabled` button emits no
  // pointer event, so a tooltip mounted on the button would never open.
  if (disabled && disabledTooltip) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-flex cursor-not-allowed", className)}>
            <span
              className={cn(
                COMPACT_CHIP,
                "pointer-events-none bg-control text-foreground/45",
                variant === "field" && "h-11 w-full rounded-lg justify-start px-3.5 font-sans font-normal text-base md:h-9 md:text-sm",
              )}
            >
              {triggerIconNode}
              <span className="max-w-[9rem] truncate">{triggerLabel}</span>
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{disabledTooltip}</TooltipContent>
      </Tooltip>
    );
  }

  const renderRow = (
    opt: ComboboxOption,
    checked: boolean,
    onSelect: () => void,
    key: string,
  ) => (
    <CommandItem
      key={key}
      value={opt.value}
      // Out of reach: the row stays READABLE (cmdk's own opacity) but is
      // neither clickable nor keyboard-navigable.
      disabled={opt.disabled}
      onSelect={onSelect}
      className={cn(opt.description && "items-start gap-2")}
    >
      {opt.icon}
      {opt.description ? (
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate">{opt.label}</span>
          <span className="text-xs text-muted-foreground">
            {opt.description}
          </span>
        </div>
      ) : (
        <span className="min-w-0 flex-1 truncate">{opt.label}</span>
      )}
      {opt.trailing}
      <HugeiconsIcon icon={CheckIcon}
        className={cn(
          "size-4 shrink-0",
          opt.description && "mt-0.5",
          checked ? "opacity-100" : "opacity-0",
        )}
      />
    </CommandItem>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        {variant === "compact" ? (
          <Button
            type="button"
            variant="ghost"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              COMPACT_CHIP,
              "bg-control text-foreground hover:bg-control-hover",
              className,
            )}
          >
            {triggerIconNode}
            <span className="max-w-[9rem] truncate">{triggerLabel}</span>
            <ChevronsUpDown className="size-3 shrink-0 opacity-50" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "h-11 w-full justify-between rounded-lg bg-control px-3.5 py-1.5 font-sans font-normal text-base focus-visible:outline-none focus-visible:ring-0 md:h-9 md:text-sm",
              className,
            )}
          >
            <span className="flex min-w-0 items-center gap-2">
              {triggerIconNode}
              <span
                className={cn(
                  "truncate",
                  !selected && "text-muted-foreground",
                )}
              >
                {triggerLabel}
              </span>
              {!selected && defaultOption?.trailing}
            </span>
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        // rounded-xl, not the popover's default rounded-lg: <Command> forces
        // its own rounded-xl and it is what paints this surface. 20px outer,
        // 8px inset (see CommandList below), 12px rows — concentric.
        className={cn(
          "min-w-48 rounded-xl p-0",
          variant === "compact"
            ? "w-80"
            : "w-[var(--radix-popover-trigger-width)]",
          contentClassName,
        )}
      >
        <Command shouldFilter={false}>
          {options.length > 8 || freeTextLabel ? (
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder={searchPlaceholder}
            />
          ) : null}
          {/* p-1, not px-1: on top of <Command>'s own p-1 that makes the SAME
              8px inset on all four sides — which is what keeps the rows'
              12px radius concentric with the popover's 20px. A horizontal-only
              padding left the last row 4px from the bottom edge and 8px from
              the sides, and no radius pairing can be right under that. */}
          <CommandList className="p-1">
            {defaultOption
              ? renderRow(
                  { ...defaultOption, value: "__default__" },
                  !value,
                  () => select(""),
                  "__default__",
                )
              : null}
            {results.map((opt) =>
              renderRow(opt, value === opt.value, () => select(opt.value), opt.value),
            )}
            {showFreeText ? (
              <CommandItem
                value={`__free__${trimmed}`}
                onSelect={() => select(trimmed)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {freeTextLabel(trimmed)}
                </span>
                <HugeiconsIcon icon={CheckIcon}
                  className={cn(
                    "size-4 shrink-0",
                    value === trimmed ? "opacity-100" : "opacity-0",
                  )}
                />
              </CommandItem>
            ) : null}
            {results.length === 0 && !showFreeText ? (
              <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                {loading ? (
                  <>
                    <Spinner />
                    {loadingLabel}
                  </>
                ) : (
                  emptyLabel
                )}
              </div>
            ) : null}
          </CommandList>
          {/* What explains the greyed rows. At the foot of the list and OUTSIDE
              the scroll: a per-row tooltip was impossible (a disabled option
              emits no pointer event), and the reason has to stay readable
              while you browse the catalogue. */}
          {footer ? (
            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
              {footer}
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
