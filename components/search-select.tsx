"use client";

// Searchable dropdowns for every field picker in the app (status, priority,
// effort, assignee, objective, parent, categories). Same trigger as before —
// but the opened menu is a cmdk <Command> with an integrated search input that
// filters the options (Linear-style). Single- and multi-select variants share
// the same Popover + Command shell.

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "mangue-ui";

export type PickerOption = {
  value: string;
  /** Shown text — also the primary search term. */
  label: string;
  /** Extra search terms (e.g. an email alongside a display name). */
  keywords?: string[];
  /** Leading visual (indicator, avatar, color dot…). */
  icon?: React.ReactNode;
};

/** cmdk forwards `data-checked` to the DOM; mangue-ui's CommandItem renders its
 *  trailing check from it. Spread (not a static prop) to stay type-safe. */
const checkedProps = (checked: boolean) =>
  checked ? ({ "data-checked": "true" } as const) : {};

type ShellProps = {
  trigger: React.ReactNode;
  /** Optional tooltip on the trigger (used by the compact card pickers). */
  tooltip?: string;
  /** Key badge (e.g. "S") shown next to the tooltip — surfaces the shortcut. */
  shortcutHint?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  align?: "start" | "center" | "end";
  contentClassName?: string;
  /** Stop pointer/click from bubbling to a draggable/clickable ancestor (cards). */
  stopPropagation?: boolean;
};

function PickerShell({
  open,
  onOpenChange,
  trigger,
  tooltip,
  shortcutHint,
  searchPlaceholder,
  emptyText,
  align = "start",
  contentClassName,
  stopPropagation,
  children,
}: ShellProps & {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("Picker");
  const stop = stopPropagation
    ? (e: React.SyntheticEvent) => e.stopPropagation()
    : undefined;

  const popover = (
    <Popover open={open} onOpenChange={onOpenChange}>
      {tooltip ? (
        <PopoverTrigger asChild>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        </PopoverTrigger>
      ) : (
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      )}
      <PopoverContent
        align={align}
        className={cn("w-60 overflow-hidden p-0", contentClassName)}
        onClick={stop}
        onPointerDown={stop}
      >
        {/* Match the search input's radius to the options (rounded-sm). The
            ancestor selector out-specifies mangue-ui's `rounded-lg!` default. */}
        <Command className="[&_[data-slot=input-group]]:rounded-sm!">
          <CommandInput autoFocus placeholder={searchPlaceholder ?? t("search")} />
          <CommandList>
            <CommandEmpty>{emptyText ?? t("noResults")}</CommandEmpty>
            <CommandGroup>{children}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );

  if (!tooltip) return popover;
  return (
    <Tooltip>
      {popover}
      <TooltipContent className="flex items-center gap-1.5">
        {tooltip}
        {shortcutHint && (
          <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground">
            {shortcutHint}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/** Single-select searchable dropdown. Pass `noneOption` to add a top item that
 *  clears the value (nullable fields like effort / assignee / objective). */
export function SearchSelect({
  value,
  onChange,
  options,
  noneOption,
  open: controlledOpen,
  onOpenChange,
  ...shell
}: ShellProps & {
  value: string | null;
  onChange: (v: string | null) => void;
  options: PickerOption[];
  noneOption?: { label: string; icon?: React.ReactNode };
  /** Controlled open state (e.g. driven by a keyboard shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const select = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <PickerShell open={open} onOpenChange={setOpen} {...shell}>
      {noneOption && (
        <CommandItem
          value="__none__"
          keywords={[noneOption.label]}
          onSelect={() => select(null)}
          {...checkedProps(value === null)}
        >
          {noneOption.icon}
          <span className="truncate">{noneOption.label}</span>
        </CommandItem>
      )}
      {options.map((opt) => (
        <CommandItem
          key={opt.value}
          value={opt.value}
          keywords={[opt.label, ...(opt.keywords ?? [])]}
          onSelect={() => select(opt.value)}
          {...checkedProps(value === opt.value)}
        >
          {opt.icon}
          <span className="truncate">{opt.label}</span>
        </CommandItem>
      ))}
    </PickerShell>
  );
}

/** Multi-select searchable dropdown (categories). Toggling keeps the menu open. */
export function SearchMultiSelect({
  values,
  onChange,
  options,
  open: controlledOpen,
  onOpenChange,
  ...shell
}: ShellProps & {
  values: string[];
  onChange: (values: string[]) => void;
  options: PickerOption[];
  /** Controlled open state (e.g. driven by a keyboard shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <PickerShell open={open} onOpenChange={setOpen} {...shell}>
      {options.map((opt) => (
        <CommandItem
          key={opt.value}
          value={opt.value}
          keywords={[opt.label, ...(opt.keywords ?? [])]}
          onSelect={() => toggle(opt.value)}
          {...checkedProps(values.includes(opt.value))}
        >
          {opt.icon}
          <span className="truncate">{opt.label}</span>
        </CommandItem>
      ))}
    </PickerShell>
  );
}
