"use client";

// Searchable dropdowns for every field picker in the app (status, priority,
// effort, assignee, objective, parent, categories). The trigger is unchanged —
// the opened menu is the shared SearchMenu shell (a cmdk <Command> with an
// integrated search input that filters the options, Linear-style). Single- and
// multi-select variants both render it in trigger-anchored mode.

import * as React from "react";
import { CommandGroup, CommandItem } from "mangue-ui";
import { SearchMenu } from "@/components/search-menu";

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
    <SearchMenu open={open} onOpenChange={setOpen} {...shell}>
      <CommandGroup>
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
      </CommandGroup>
    </SearchMenu>
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
    <SearchMenu open={open} onOpenChange={setOpen} {...shell}>
      <CommandGroup>
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
      </CommandGroup>
    </SearchMenu>
  );
}
