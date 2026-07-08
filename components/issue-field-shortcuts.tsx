"use client";

// Contextual keyboard shortcuts for editing an issue's fields without clicking
// its indicator. While the pointer hovers a card (or the ticket side panel),
// pressing a field key opens that field's picker — the same searchable cmdk as
// a right-click — anchored at the cursor:
//
//   S status · P priority · E effort · A assignee · L labels/categories
//   D due date · O objective
//
// `useIssueFieldShortcuts` owns the hover gate + pointer tracking + open state;
// `IssueShortcutMenu` renders the picker for the active field.

import * as React from "react";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "mangue-ui";
import { useChordPrefix } from "@/lib/keyboard/keyboard-context";
import { CommandAnchor } from "@/components/command-anchor";
import { DateTimePicker } from "@/components/date-time-picker";
import { Dot } from "@/components/issue-property-fields";
import {
  StatusIndicator,
  PriorityIndicator,
} from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import type {
  Category,
  Issue,
  IssueUpdateInput,
  Member,
  Objective,
} from "@/lib/types";

/** Fields a keyboard shortcut can open. */
export type ShortcutField =
  | "status"
  | "priority"
  | "effort"
  | "assignee"
  | "category"
  | "dueDate"
  | "objective";

/** Lowercased key → field. `c` is deliberately absent (taken by quick-create).
 *  Exported so the create-issue dialog can drive its own pickers off the same
 *  mapping (S/P/E/A/L/D/O) without duplicating it. */
export const SHORTCUT_KEYS: Record<string, ShortcutField> = {
  s: "status",
  p: "priority",
  e: "effort",
  a: "assignee",
  l: "category",
  d: "dueDate",
  o: "objective",
};

export interface ShortcutMenuState {
  field: ShortcutField;
  /** Viewport coordinates to anchor the picker at. */
  position: { x: number; y: number };
}

/**
 * Wires up the field shortcuts for one hoverable region (a card or the panel).
 * Spread `containerProps` on the element that should react to hover; render
 * `<IssueShortcutMenu state={menuState} onClose={closeMenu} … />` inside it.
 *
 * @param enabled Extra gate on top of hover (e.g. the panel being open).
 * @param actions Extra key → callback shortcuts that fire the callback directly
 *   instead of opening a picker. Keys are lowercased, optionally prefixed with
 *   `shift+` (e.g. `"shift+p"` to copy the prompt). Field shortcuts (S/P/E/…)
 *   only ever fire without Shift, so a Shift combo never collides with them.
 * @param disabledKeys Field-shortcut keys to leave alone here (lowercased), so
 *   another handler can own them in this context — e.g. the side panel frees
 *   `d` (normally the due-date picker) for voice dictation. The key isn't
 *   swallowed, so the event still reaches that other handler.
 */
export function useIssueFieldShortcuts(
  enabled = true,
  actions?: Record<string, () => void>,
  disabledKeys?: string[]
) {
  const posRef = React.useRef<{ x: number; y: number } | null>(null);
  // Latest actions/disabledKeys without re-subscribing the listener each render.
  const actionsRef = React.useRef(actions);
  actionsRef.current = actions;
  const disabledKeysRef = React.useRef(disabledKeys);
  disabledKeysRef.current = disabledKeys;
  // While a global G-chord is armed, stand down so its second key (A/O/S…)
  // routes to navigation instead of opening a field picker on the hovered card.
  const chordArmedRef = React.useRef(false);
  chordArmedRef.current = useChordPrefix() !== null;
  const [hovered, setHovered] = React.useState(false);
  const [menuState, setMenuState] = React.useState<ShortcutMenuState | null>(null);

  React.useEffect(() => {
    if (!enabled || !hovered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (chordArmedRef.current) return;
      const el = e.target as HTMLElement | null;
      // Never hijack keys while the user is typing (title, description, search…).
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      )
        return;
      const key = e.key.toLowerCase();
      const action =
        actionsRef.current?.[e.shiftKey ? `shift+${key}` : key];
      if (action) {
        // Capture phase + stopImmediatePropagation: while hovering, this owns
        // the combo — e.g. Shift+P copies here without touching the P picker.
        e.preventDefault();
        e.stopImmediatePropagation();
        action();
        return;
      }
      // Field pickers are unmodified single keys only.
      if (e.shiftKey) return;
      // A key handed off to another handler in this context: don't map it and
      // don't swallow it, so that handler still receives the event.
      if (disabledKeysRef.current?.includes(key)) return;
      const field = SHORTCUT_KEYS[key];
      if (!field || !posRef.current) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setMenuState({ field, position: posRef.current });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [enabled, hovered]);

  const track = (e: React.MouseEvent) => {
    posRef.current = { x: e.clientX, y: e.clientY };
    if (!hovered) setHovered(true);
  };

  const containerProps = {
    onMouseEnter: track,
    onMouseMove: track,
    onMouseLeave: () => setHovered(false),
  };

  return {
    containerProps,
    menuState,
    closeMenu: React.useCallback(() => setMenuState(null), []),
  };
}

/** cmdk reads `data-checked` off the DOM to render the trailing check. */
const checked = (on: boolean) => (on ? { "data-checked": "true" as const } : {});

export function IssueShortcutMenu({
  state,
  onClose,
  issue,
  members,
  categories,
  objectives,
  onUpdate,
  onSetCategories,
}: {
  state: ShortcutMenuState | null;
  onClose: () => void;
  issue: Issue;
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  onUpdate: (patch: IssueUpdateInput) => void;
  onSetCategories: (ids: string[]) => void;
}) {
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("IssueUI");

  if (!state) return null;
  const { field, position } = state;

  // Single-select: apply then close. Multi-select (categories) keeps the menu open.
  const apply = (patch: IssueUpdateInput) => {
    onUpdate(patch);
    onClose();
  };

  // Due date opens the full calendar (not a cmdk list) at the pointer.
  if (field === "dueDate") {
    return (
      <DateTimePicker
        variant="anchored"
        open
        onOpenChange={(o) => !o && onClose()}
        anchor={position}
        value={issue.due_date}
        onChange={(due_date) => onUpdate({ due_date })}
        ariaLabel={tIssue("changeDueDateAria")}
      />
    );
  }

  let items: React.ReactNode = null;
  switch (field) {
    case "status":
      items = ALL_STATUSES.map((s) => (
        <CommandItem
          key={s.value}
          value={s.value}
          keywords={[tStatus(s.value)]}
          onSelect={() => apply({ status: s.value as IssueStatus })}
          {...checked(issue.status === s.value)}
        >
          <StatusIndicator status={s.value} className="size-4" />
          <span className="truncate">{tStatus(s.value)}</span>
        </CommandItem>
      ));
      break;
    case "priority":
      items = PRIORITIES.map((p) => (
        <CommandItem
          key={p.value}
          value={p.value}
          keywords={[tPriority(p.value)]}
          onSelect={() => apply({ priority: p.value as IssuePriority })}
          {...checked(issue.priority === p.value)}
        >
          <PriorityIndicator priority={p.value} className="size-4" />
          <span className="truncate">{tPriority(p.value)}</span>
        </CommandItem>
      ));
      break;
    case "effort":
      items = (
        <>
          <CommandItem
            value="__none__"
            keywords={[tCommon("none")]}
            onSelect={() => apply({ effort: null })}
            {...checked(issue.effort === null)}
          >
            <span className="truncate">{tCommon("none")}</span>
          </CommandItem>
          {EFFORTS.map((eff) => (
            <CommandItem
              key={eff.value}
              value={eff.value}
              keywords={[eff.label]}
              onSelect={() => apply({ effort: eff.value as IssueEffort })}
              {...checked(issue.effort === eff.value)}
            >
              <span className="truncate">{eff.label}</span>
            </CommandItem>
          ))}
        </>
      );
      break;
    case "assignee":
      items = (
        <>
          <CommandItem
            value="__none__"
            keywords={[tField("unassigned")]}
            onSelect={() => apply({ assignee_id: null })}
            {...checked(issue.assignee_id === null)}
          >
            <span className="truncate text-muted-foreground">
              {tField("unassigned")}
            </span>
          </CommandItem>
          {members.map((m) => (
            <CommandItem
              key={m.user_id}
              value={m.user_id}
              keywords={[displayName(m), ...(m.email ? [m.email] : [])]}
              onSelect={() => apply({ assignee_id: m.user_id })}
              {...checked(issue.assignee_id === m.user_id)}
            >
              <UserAvatar
                url={m.avatar_url}
                name={displayName(m)}
                seed={m.user_id}
                className="size-5 text-[9px]"
              />
              <span className="truncate">{displayName(m)}</span>
            </CommandItem>
          ))}
        </>
      );
      break;
    case "objective":
      items = (
        <>
          <CommandItem
            value="__none__"
            keywords={[tCommon("none")]}
            onSelect={() => apply({ objective_id: null })}
            {...checked(issue.objective_id === null)}
          >
            <span className="truncate text-muted-foreground">{tCommon("none")}</span>
          </CommandItem>
          {objectives.map((o) => (
            <CommandItem
              key={o.id}
              value={o.id}
              keywords={[o.name]}
              onSelect={() => apply({ objective_id: o.id })}
              {...checked(issue.objective_id === o.id)}
            >
              <Dot color={o.color} />
              <span className="truncate">{o.name}</span>
            </CommandItem>
          ))}
        </>
      );
      break;
    case "category": {
      const selected = new Set(issue.category_ids);
      const toggle = (id: string) =>
        onSetCategories(
          selected.has(id)
            ? issue.category_ids.filter((x) => x !== id)
            : [...issue.category_ids, id]
        );
      items = categories.map((c) => (
        <CommandItem
          key={c.id}
          value={c.id}
          keywords={[c.name]}
          onSelect={() => toggle(c.id)}
          {...checked(selected.has(c.id))}
        >
          <Dot color={c.color} />
          <span className="truncate">{c.name}</span>
        </CommandItem>
      ));
      break;
    }
  }

  return (
    <CommandAnchor position={position} onClose={onClose}>
      <CommandGroup>{items}</CommandGroup>
    </CommandAnchor>
  );
}
