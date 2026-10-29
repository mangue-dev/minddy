"use client";

// Contextual keyboard shortcuts for editing an issue's fields without clicking
// its indicator. While the pointer hovers a card (or the ticket side panel),
// pressing a field key opens that field's picker — the same searchable cmdk as
// a right-click — anchored at the cursor:
//
//   S status · P priority · E effort · A assignee · L labels/categories
//   D due date · O objective
//
// R (MIN-749) adds a relation: it is not a field, so each surface maps it to
// its own relation menu through `actions` (see `RELATION_SHORTCUT_KEY`).
//
// `useIssueFieldShortcuts` owns the hover gate + pointer tracking + open state;
// `IssueShortcutMenu` renders the picker for the active field.
//
// The hover gate itself lives in `useHoverKeys` (lib/keyboard/hover-keys.ts):
// the target card is resolved from the DOM at keystroke time, never from React
// state — see MIN-158 for why that distinction is the whole bug.

import * as React from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SMART_ASSIGN_ICON } from "@/components/feature-icons";
import { smartAssignFillsEmptyAssignee } from "@/lib/smart-assign-config";
import { useSmartAssignFillsEmpty } from "@/lib/use-smart-assign-empty";
import { TriangleIcon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { RELATION_TYPES } from "@/lib/relation-constants";
import type { HierarchyRelation, RelationMenuKind } from "@/lib/issue-hierarchy";
import { useChordPrefixForEvents } from "@/lib/keyboard/keyboard-context";
import { useHoverKeys } from "@/lib/keyboard/hover-keys";
import { selectionKeysActive } from "@/lib/keyboard/selection-keys";
import { CommandAnchor } from "@/components/command-anchor";
import { PickerCreateRow } from "@/components/search-select";
import {
  useCategoryCreateOption,
  useObjectiveCreateOption,
} from "@/lib/use-picker-create";
import { DateTimePicker } from "@/components/date-time-picker";
import { Dot } from "@/components/issue-property-fields";
import { ObjectivePill } from "@/components/objective-label";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import { useUndoHistory } from "@/lib/undo/undo-context";
import {
  allTargetsHaveCategory,
  allTargetsMatch,
  sharedValue,
  toggleCategoryAcross,
} from "@/lib/issue-shortcut-targets";
import {
  StatusIndicator,
  PriorityIndicator,
  RelationIcon,
} from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import { displayName } from "@/lib/display-name";
import { eventKey } from "@/lib/keyboard/event-key";
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

/** Field → uppercase shortcut key badge (the inverse of `SHORTCUT_KEYS`). The
 *  single source for the `<kbd>` hints shown in picker tooltips, so a badge can
 *  never drift from the key the listener actually handles. */
export const KEY_FOR_FIELD = Object.fromEntries(
  Object.entries(SHORTCUT_KEYS).map(([key, field]) => [field, key.toUpperCase()]),
) as Record<ShortcutField, string>;

/** Adds a relation (MIN-749): opens the relation-type choice, then its target.
 *  Not a `ShortcutField` — a relation is not a value of the issue — so every
 *  surface wires it to its own relation menu. */
export const RELATION_SHORTCUT_KEY = "r";
/** The `<kbd>` badge shown next to the relation buttons' tooltips. */
export const RELATION_SHORTCUT_HINT = RELATION_SHORTCUT_KEY.toUpperCase();

export interface ShortcutMenuState {
  field: ShortcutField;
  /** Viewport coordinates to anchor the picker at. */
  position: { x: number; y: number };
}

/**
 * Wires up the field shortcuts for one hoverable region (a card or the panel).
 * Spread `containerProps` on the element that should react to hover — it
 * carries a `ref`, so an element that already has one must merge them — and
 * render `<IssueShortcutMenu state={menuState} onClose={closeMenu} … />` inside it.
 *
 * @param enabled Extra gate on top of hover (e.g. the panel being open).
 * @param actions Extra key → callback shortcuts that fire the callback directly
 *   instead of opening a picker. The callback receives the last pointer
 *   position over the region, to anchor a menu at the cursor. Keys are lowercased, optionally prefixed with
 *   `shift+` (e.g. `"shift+p"` to copy the prompt). Field shortcuts (S/P/E/…)
 *   only ever fire without Shift, so a Shift combo never collides with them.
 * @param disabledKeys Field-shortcut keys to leave alone here (lowercased), so
 *   another handler can own them in this context — e.g. the side panel frees
 *   `d` (normally the due-date picker) for voice dictation. The key isn't
 *   swallowed, so the event still reaches that other handler.
 */
export function useIssueFieldShortcuts(
  enabled = true,
  actions?: Record<string, (position: { x: number; y: number } | null) => void>,
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
  const chordPrefixRef = useChordPrefixForEvents();
  const [menuState, setMenuState] = React.useState<ShortcutMenuState | null>(null);

  const hoverRef = useHoverKeys((e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (chordPrefixRef.current !== null) return;
    const el = e.target as HTMLElement | null;
    // Never hijack keys while the user is typing (title, description, search…).
    if (
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable)
    )
      return;
    const key = eventKey(e);
    const action = actionsRef.current?.[e.shiftKey ? `shift+${key}` : key];
    if (action) {
      // A ticket selection owns ⇧P while the pill is up (MIN-539): the
      // selection acts on every checked ticket, hover must not narrow the
      // action to one. Stand down WITHOUT consuming — the selection listener
      // (lib/use-bulk-selection-actions.ts) takes it from here. Other Shift
      // combos (⇧C, a comment on ONE ticket) have no selection variant.
      if (e.shiftKey && key === "p" && selectionKeysActive()) return;
      // Capture phase + stopImmediatePropagation: while hovering, this owns
      // the combo — e.g. Shift+P copies here without touching the P picker.
      e.preventDefault();
      e.stopImmediatePropagation();
      action(posRef.current);
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
  }, enabled);

  // The hover is no longer recorded anywhere: these two handlers are no longer useful
  // just remember WHERE to anchor the picker (the last point of the cursor on the area).
  const track = (e: React.MouseEvent) => {
    posRef.current = { x: e.clientX, y: e.clientY };
  };

  const containerProps = {
    ref: hoverRef,
    onMouseEnter: track,
    onMouseMove: track,
  };

  return {
    containerProps,
    menuState,
    // Open a picker WITHOUT using its key: the right-click menu offers
    // the fields that the card does not display (objective, deadline) and opens them
    // at the point of click — the menu entry and shortcut then do the same
    // thing, by the same path.
    openField: React.useCallback(
      (field: ShortcutField, position: { x: number; y: number }) =>
        setMenuState({ field, position }),
      []
    ),
    closeMenu: React.useCallback(() => setMenuState(null), []),
  };
}

/** cmdk reads `data-checked` off the DOM to render the trailing check. */
const checked = (on: boolean) => (on ? { "data-checked": "true" as const } : {});

/**
 * The objective rows of the O menu, in picker order. A component of its own so
 * the ordering (and the ticket lists it reads) only exists while this menu is
 * open — the menu itself is mounted on every card.
 */
function ObjectiveShortcutItems({
  objectives,
  value,
  onSelect,
}: {
  objectives: Objective[];
  value: string | null;
  onSelect: (objectiveId: string) => void;
}) {
  return useOrderedObjectives(objectives).map((o) => (
    <CommandItem
      key={o.id}
      value={o.id}
      keywords={[o.name]}
      onSelect={() => onSelect(o.id)}
      {...checked(value === o.id)}
    >
      <ObjectivePill objective={o} />
    </CommandItem>
  ));
}

export function IssueShortcutMenu({
  state,
  onClose,
  issue,
  targets,
  members,
  categories,
  objectives,
  onUpdate,
  onSetCategories,
}: {
  state: ShortcutMenuState | null;
  onClose: () => void;
  /** The ticket the picker is anchored on: its project feeds the quick-create rows. */
  issue: Issue;
  /** Every ticket the picker writes to (MIN-795), `issue` included — a board
   *  selection when the card belongs to one. Defaults to `issue` alone. Check
   *  marks only show values that ALL targets share. */
  targets?: Issue[];
  members: Member[];
  categories: Category[];
  objectives: Objective[];
  /** Applies the patch to every target. */
  onUpdate: (patch: IssueUpdateInput) => void;
  /** Sets ONE target's categories. */
  onSetCategories: (ids: string[], issueId: string) => void;
}) {
  const writeTargets = targets ?? [issue];
  // Clearing the assignee lets Smart Assign choose when it fills every
  // target's empty assignee (MIN-811): the row then names it.
  const smartAssign =
    useSmartAssignFillsEmpty(issue.project_id, issue.status) &&
    writeTargets.every(
      (target) => target.project_id === issue.project_id && smartAssignFillsEmptyAssignee(true, target.status),
    );
  // Category writes across several targets are one gesture for ⌘Z (MIN-795).
  const { linked } = useUndoHistory();
  const tBulk = useTranslations("BulkActions");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("IssueUI");
  // Search held here (and not by cmdk): the “Add…” lines make it
  // name of what they create.
  const [query, setQuery] = React.useState("");
  const categoryCreate = useCategoryCreateOption({
    projectId: issue.project_id,
    categories,
    onCreated: (category) =>
      linked(() => {
        for (const target of writeTargets) {
          onSetCategories([...target.category_ids, category.id], target.id);
        }
      }),
  });
  const objectiveCreate = useObjectiveCreateOption({
    projectId: issue.project_id,
    onCreated: (objective) => onUpdate({ objective_id: objective.id }),
  });
  // Each opening starts with an empty search (the menu remains mounted between two).
  React.useEffect(() => {
    if (!state) setQuery("");
  }, [state]);

  if (!state) return null;
  const { field, position } = state;

  const all = <T,>(read: (target: Issue) => T, value: T) =>
    checked(allTargetsMatch(writeTargets, read, value));

  // Single-select: apply then close. Multi-select (categories) keeps the menu open.
  const apply = (patch: IssueUpdateInput) => {
    onUpdate(patch);
    onClose();
  };

  // Due date opens the full calendar (not a cmdk list) at the pointer.
  // `stopPropagation`: the calendar is portalized but rendered in the tree
  // React, inside the clickable map — without it, choose a day
  // would open the ticket on top (same precaution as `CommandAnchor`).
  if (field === "dueDate") {
    return (
      <DateTimePicker
        variant="anchored"
        open
        stopPropagation
        onOpenChange={(o) => !o && onClose()}
        anchor={position}
        value={sharedValue(writeTargets, (target) => target.due_date)}
        onChange={(due_date) => onUpdate({ due_date })}
        recurrence={sharedValue(writeTargets, (target) => target.recurrence)}
        onRecurrenceChange={(next) => onUpdate(next)}
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
          {...all((target) => target.status, s.value)}
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
          {...all((target) => target.priority, p.value)}
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
            keywords={[tField("effortNone")]}
            onSelect={() => apply({ effort: null })}
            {...all((target) => target.effort, null)}
          >
            <span className="truncate">{tField("effortNone")}</span>
          </CommandItem>
          {EFFORTS.map((eff) => (
            <CommandItem
              key={eff.value}
              value={eff.value}
              keywords={[eff.label]}
              onSelect={() => apply({ effort: eff.value as IssueEffort })}
              {...all((target) => target.effort, eff.value)}
            >
              <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />
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
            keywords={[tField(smartAssign ? "smartAssign" : "unassigned")]}
            onSelect={() => apply({ assignee_id: null })}
            {...all((target) => target.assignee_id, null)}
          >
            {smartAssign && (
              <HugeiconsIcon icon={SMART_ASSIGN_ICON} className="size-4 text-muted-foreground" />
            )}
            <span className="truncate text-muted-foreground">
              {tField(smartAssign ? "smartAssign" : "unassigned")}
            </span>
          </CommandItem>
          {members.map((m) => (
            <CommandItem
              key={m.user_id}
              value={m.user_id}
              keywords={[displayName(m), ...(m.email ? [m.email] : [])]}
              onSelect={() => apply({ assignee_id: m.user_id })}
              {...all((target) => target.assignee_id, m.user_id)}
            >
              <UserAvatar
                seed={m.avatar_seed}
                className="size-5"
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
            {...all((target) => target.objective_id, null)}
          >
            <span className="truncate text-muted-foreground">{tCommon("none")}</span>
          </CommandItem>
          <ObjectiveShortcutItems
            objectives={objectives}
            value={sharedValue(writeTargets, (target) => target.objective_id)}
            onSelect={(objective_id) => apply({ objective_id })}
          />
        </>
      );
      break;
    case "category": {
      const toggle = (id: string) =>
        linked(() => {
          for (const [issueId, ids] of toggleCategoryAcross(writeTargets, id)) {
            onSetCategories(ids, issueId);
          }
        });
      items = categories.map((c) => (
        <CommandItem
          key={c.id}
          value={c.id}
          keywords={[c.name]}
          onSelect={() => toggle(c.id)}
          {...checked(allTargetsHaveCategory(writeTargets, c.id))}
        >
          <Dot color={c.color} />
          <span className="truncate">{c.name}</span>
        </CommandItem>
      ));
      break;
    }
  }

  // Quick addition, on the two fields that are created from their menu — the
  // same gesture as in the clickable pickers, here at the L/O shortcut.
  const create =
    field === "category"
      ? categoryCreate
      : field === "objective"
        ? objectiveCreate
        : undefined;

  return (
    <CommandAnchor
      position={position}
      onClose={onClose}
      searchValue={create ? query : undefined}
      onSearchValueChange={create ? setQuery : undefined}
      hideEmpty={!!create && query.trim() !== ""}
    >
      <CommandGroup
        heading={
          writeTargets.length > 1
            ? tBulk("selected", { count: writeTargets.length })
            : undefined
        }
      >
        {items}
      </CommandGroup>
      {create && (
        <PickerCreateRow
          create={create}
          query={query}
          takenLabels={
            field === "category"
              ? categories.map((c) => c.name)
              : objectives.map((o) => o.name)
          }
          onDone={() => {
            setQuery("");
            if (create.closeOnCreate) onClose();
          }}
        />
      )}
    </CommandAnchor>
  );
}

/**
 * The relation-type step of R on a hovered card (MIN-749), at the cursor. The
 * card then opens the ⌘K palette on the targets of the chosen type (MIN-844),
 * as its right-click Relations entry does.
 */
export function RelationTypePicker({
  position,
  onClose,
  onSelect,
  targetCount = 1,
  hierarchy = [],
}: {
  position: { x: number; y: number } | null;
  onClose: () => void;
  onSelect: (type: RelationMenuKind) => void;
  /** Tickets the relation is added from (MIN-795): a selection names its size. */
  targetCount?: number;
  /** The parent / sub-issue entries these tickets may take (MIN-804). */
  hierarchy?: readonly HierarchyRelation[];
}) {
  const t = useTranslations("Relations");
  const tBulk = useTranslations("BulkActions");
  if (!position) return null;
  return (
    <CommandAnchor position={position} onClose={onClose}>
      <CommandGroup
        heading={targetCount > 1 ? tBulk("selected", { count: targetCount }) : t("relations")}
      >
        {[...RELATION_TYPES, ...hierarchy].map((type) => (
          <CommandItem
            key={type}
            value={type}
            keywords={[t(`action_${type}`)]}
            onSelect={() => {
              onClose();
              onSelect(type);
            }}
          >
            <RelationIcon relation={type} className="size-4" />
            <span className="truncate">{t(type)}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandAnchor>
  );
}
