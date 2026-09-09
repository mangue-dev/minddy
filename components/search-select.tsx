"use client";

// Searchable dropdowns for every field picker in the app (status, priority,
// effort, assignee, objective, parent, categories). The trigger is unchanged —
// the opened menu is the shared SearchMenu shell (a cmdk <Command> with an
// integrated search input that filters the options, Linear-style). Single- and
// multi-select variants both render it in trigger-anchored mode.

import * as React from "react";
import { Plus } from "lucide-react";
import { CommandGroup, CommandItem, CommandSeparator, Spinner, toast } from "mangue-ui";
import { SearchMenu } from "@/components/search-menu";

/**
 * The trigger of a picker which PRESENTS LIKE A FIELD — placed in a
 * form line, next to a `Input` or `Button` outline.
 *
 * He lives here, and not copied to each caller, because he diverged
 * exactly like this: both copies wrote `bg-transparent`, and the
 * field therefore appeared EMPTY next to its neighbors, which are in `bg-control`
 * (cf. `Input` and the `outline` variant of `Button` in mango-ui). A background
 * transparent is legitimate on a map; in a row of fields it reads
 * like a disabled or not yet loaded control.
 *
 * Pickers whose trigger is a PELLET (the compact fields of a
 * ticket) have nothing to do with this: they pass their own `trigger`.
 */
export const PICKER_FIELD_TRIGGER =
  "flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-input bg-control px-3 text-sm outline-none transition-colors hover:bg-control-hover focus-visible:border-ring";

export type PickerOption = {
  value: string;
  /** Shown text — also the primary search term. */
  label: string;
  /** Extra search terms (e.g. an email alongside a display name). */
  keywords?: string[];
  /** Leading visual (indicator, avatar, color dot…). */
  icon?: React.ReactNode;
};

/**
 * A last line of the menu that CREATES what we can't find — quick add
 * category / objective from any board. It only exists
 * from the moment something is typed: this text IS the name of what we
 * creates, so without it the line would have nothing to do. On the other hand, she remains
 * visible when the search doesn't match anything — that's when it's most useful.
 *
 * The hooks that make it, with their translated wordings and their writing,
 * live in lib/use-picker-create.ts — a picker just passes it.
 */
export type PickerCreateOption = {
  /** Label, built on the typed text (“Create “design””). */
  labelFor: (name: string) => string;
  /** Creates the entity from the typed text (never empty). */
  onCreate: (name: string) => void | Promise<void>;
  /** Close the menu instead of keeping it open — the objective picker passes the
   * hand to its dialog, which needs the keyboard. */
  closeOnCreate?: boolean;
};

/** The creation line, pinned at the bottom of the menu.
 *
 * `forceMount` on the item AND on its group: without it, cmdk hides one
 * (zero filter score) and the other (no item recorded in the group) from
 * that the research does not match — that is to say exactly when we want to create.
 * The separator is only displayed by default ONLY empty search, hence
 *  `alwaysRender`. */
export function PickerCreateRow({
  create,
  query,
  takenLabels,
  onDone,
}: {
  create: PickerCreateOption;
  /** Common search text — it becomes the name of what we create. */
  query: string;
  /** Names already taken from this menu (case insensitive comparison). */
  takenLabels: string[];
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const name = query.trim();
  // Nothing typed: no line (it would have no name to give).
  if (!name) return null;
  // A name already taken cannot be proposed a second time: the existing line
  // is just above, checking it is the right move.
  if (takenLabels.some((label) => label.trim().toLowerCase() === name.toLowerCase()))
    return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await create.onCreate(name);
      onDone();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <CommandSeparator alwaysRender className="my-1" />
      <CommandGroup forceMount>
        <CommandItem
          forceMount
          value="__create__"
          disabled={busy}
          onSelect={() => void run()}
        >
          {busy ? (
            <Spinner className="size-4 shrink-0" />
          ) : (
            <Plus className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{create.labelFor(name)}</span>
        </CommandItem>
      </CommandGroup>
    </>
  );
}

/** cmdk forwards `data-checked` to the DOM; mangue-ui's CommandItem renders its
 *  trailing check from it. Spread (not a static prop) to stay type-safe.
 *
 * Exported for menus that are built on `SearchMenu` directly, without
 * go through the two variations below — a menu with MULTIPLE dimensions (the
 * pull requests filter: state + author) has not one value but two, and
 * must therefore check his lines himself. */
export const checkedProps = (checked: boolean) =>
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

/** Open state + search text, shared by the two variants. The search is only
 *  controlled when a create row needs to read it (cmdk owns it otherwise). */
function usePickerShell(
  controlledOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
  createOption: PickerCreateOption | undefined
) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (!next) setQuery("");
    onOpenChange?.(next);
    if (controlledOpen === undefined) setUncontrolledOpen(next);
  };
  const searchProps = createOption
    ? {
        searchValue: query,
        onSearchValueChange: setQuery,
        // “No results” is only cleared when the creation line takes
        // his place. Empty search, it does not exist: a project without any
        // category therefore keeps its indication.
        hideEmpty: query.trim() !== "",
      }
    : {};
  return { open, setOpen, query, setQuery, searchProps };
}

/** Single-select searchable dropdown. Pass `noneOption` to add a top item that
 *  clears the value (nullable fields like effort / assignee / objective). */
export function SearchSelect({
  value,
  onChange,
  options,
  noneOption,
  createOption,
  open: controlledOpen,
  onOpenChange,
  ...shell
}: ShellProps & {
  value: string | null;
  onChange: (v: string | null) => void;
  options: PickerOption[];
  noneOption?: { label: string; icon?: React.ReactNode };
  /** Last line “Add…” (see {@link PickerCreateOption}). */
  createOption?: PickerCreateOption;
  /** Controlled open state (e.g. driven by a keyboard shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { open, setOpen, query, setQuery, searchProps } = usePickerShell(
    controlledOpen,
    onOpenChange,
    createOption
  );
  const select = (v: string | null) => {
    onChange(v);
    setOpen(false);
  };
  return (
    <SearchMenu open={open} onOpenChange={setOpen} {...shell} {...searchProps}>
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
      {createOption && (
        <PickerCreateRow
          create={createOption}
          query={query}
          takenLabels={options.map((o) => o.label)}
          onDone={() => {
            setQuery("");
            if (createOption.closeOnCreate) setOpen(false);
          }}
        />
      )}
    </SearchMenu>
  );
}

/** Multi-select searchable dropdown (categories). Toggling keeps the menu open. */
export function SearchMultiSelect({
  values,
  onChange,
  options,
  createOption,
  open: controlledOpen,
  onOpenChange,
  ...shell
}: ShellProps & {
  values: string[];
  onChange: (values: string[]) => void;
  options: PickerOption[];
  /** Last line “Add…” (see {@link PickerCreateOption}). */
  createOption?: PickerCreateOption;
  /** Controlled open state (e.g. driven by a keyboard shortcut). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const { open, setOpen, query, setQuery, searchProps } = usePickerShell(
    controlledOpen,
    onOpenChange,
    createOption
  );
  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <SearchMenu open={open} onOpenChange={setOpen} {...shell} {...searchProps}>
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
      {createOption && (
        <PickerCreateRow
          create={createOption}
          query={query}
          takenLabels={options.map((o) => o.label)}
          onDone={() => {
            // The multiple selection remains open: we have just added a
            // label, maybe we want a second one. The field starts again
            // empty so as not to hide the list behind the search before.
            setQuery("");
            if (createOption.closeOnCreate) setOpen(false);
          }}
        />
      )}
    </SearchMenu>
  );
}
