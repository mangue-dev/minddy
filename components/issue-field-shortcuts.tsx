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
import { ProjectsContext } from "@/lib/projects-context-store";
import { useTranslations } from "next-intl";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { RELATION_TYPES } from "@/lib/relation-constants";
import type { HierarchyRelation, RelationMenuKind } from "@/lib/issue-hierarchy";
import { useChordPrefixForEvents } from "@/lib/keyboard/keyboard-context";
import { keyboardAnchorIn, useHoverKeys } from "@/lib/keyboard/hover-keys";
import { keyboardAimsLast } from "@/lib/keyboard-modality";
import { selectionKeysActive } from "@/lib/keyboard/selection-keys";
import { CommandAnchor } from "@/components/command-anchor";
import { useMountedWhileClosing } from "@/components/ui/overlay-freeze";
import { PickerCreateRow } from "@/components/search-select";
import {
  useCategoryCreateOption,
  useObjectiveCreateOption,
} from "@/lib/use-picker-create";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  categoryFieldOptions,
  effortFieldOptions,
  memberFieldOptions,
  objectiveFieldOptions,
  priorityFieldOptions,
  statusFieldOptions,
  type FieldOption,
} from "@/components/issue-field-options";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import { useUndoHistory } from "@/lib/undo/undo-context";
import {
  allTargetsHaveCategory,
  allTargetsMatch,
  sharedValue,
  toggleCategoryAcross,
} from "@/lib/issue-shortcut-targets";
import { RelationIcon } from "@/components/issue-indicators";
import { eventKey } from "@/lib/keyboard/event-key";
import type { IssueStatus, IssuePriority, IssueEffort } from "@/lib/issue-constants";
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

  // The region itself: a key typed from the keyboard anchors the picker on
  // the focused control, which no pointer position describes (WCAG 2.1.1).
  const regionRef = React.useRef<Element | null>(null);
  const anchor = () => keyboardAnchorIn(regionRef.current) ?? posRef.current;

  const registerHoverKeys = useHoverKeys((e) => {
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
    // Space presses a control the keyboard focused inside this region (Tab to
    // a card's status button, then Space). Everywhere else it is the region's
    // action: a mouse user aims with the pointer, and focus left on a button
    // by an earlier click (a picker trigger Radix refocuses on close, a
    // toolbar button, another card) must neither swallow Space on the hovered
    // card nor be pressed in its place. The region's own focus stop (a card's
    // drag wrapper) sits outside the region, so it keeps the region's action.
    if (
      key === " " &&
      el &&
      keyboardAimsLast() &&
      regionRef.current?.contains(el) &&
      el.closest("button, a[href], [role=button], [role=combobox], [role=checkbox], [role=switch]")
    )
      return;
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
      action(anchor());
      return;
    }
    // Field pickers are unmodified single keys only.
    if (e.shiftKey) return;
    // A key handed off to another handler in this context: don't map it and
    // don't swallow it, so that handler still receives the event.
    if (disabledKeysRef.current?.includes(key)) return;
    const field = SHORTCUT_KEYS[key];
    const position = anchor();
    if (!field || !position) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    setMenuState({ field, position });
  }, enabled);
  const hoverRef = React.useCallback((el: Element | null) => {
    regionRef.current = el;
    registerHoverKeys(el);
  }, [registerHoverKeys]);

  // These handlers only remember where to anchor the picker: the last pointer
  // position over the region.
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
    // Opens a picker without its key: the right-click menu offers the fields
    // the card does not show (objective, due date) and opens them where it
    // was clicked, so the menu entry and the shortcut take the same path.
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
  render,
}: {
  objectives: Objective[];
  render: (options: FieldOption[]) => React.ReactNode;
}) {
  return render(objectiveFieldOptions(useOrderedObjectives(objectives)));
}

/** Built once: the effort scale does not depend on the locale. */
const EFFORT_OPTIONS = effortFieldOptions();

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
  const project = React.useContext(ProjectsContext)?.projects.find((item) => item.id === issue.project_id);
  const smartAssign = writeTargets.every(
    (target) =>
      target.project_id === issue.project_id &&
      smartAssignFillsEmptyAssignee(project, {
        status: target.status,
        assigneeId: target.assignee_id,
        createdAt: target.created_at,
      }),
  );
  // Category writes across several targets are one gesture for ⌘Z (MIN-795).
  const { linked } = useUndoHistory();
  const tBulk = useTranslations("BulkActions");
  const tStatus = useTranslations("Status");
  const tPriority = useTranslations("Priority");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const tIssue = useTranslations("IssueUI");
  // The search is held here rather than by cmdk: the “Add…” row names what
  // it creates after it.
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
  // Each opening starts with an empty search: the menu stays mounted between openings.
  React.useEffect(() => {
    if (!state) setQuery("");
  }, [state]);

  // Closed, the picker stays on its last field and point for its exit
  // animation (components/ui/overlay-freeze.tsx), then unmounts.
  const lastState = React.useRef(state);
  if (state) lastState.current = state;
  const mounted = useMountedWhileClosing(state !== null);
  const shown = state ?? lastState.current;
  if (!mounted || !shown) return null;
  const { field } = shown;
  const position = state ? shown.position : null;

  const all = <T,>(read: (target: Issue) => T, value: T) =>
    checked(allTargetsMatch(writeTargets, read, value));

  // Single-select: apply then close. Multi-select (categories) keeps the menu open.
  const apply = (patch: IssueUpdateInput) => {
    onUpdate(patch);
    onClose();
  };

  // Due date opens the full calendar (not a cmdk list) at the pointer.
  // `stopPropagation`: the calendar is portaled but stays inside the
  // clickable card in the React tree, so without it choosing a day would also
  // open the ticket (the same precaution as `CommandAnchor`).
  if (field === "dueDate") {
    return (
      <DateTimePicker
        variant="anchored"
        open={state !== null}
        stopPropagation
        onOpenChange={(o) => !o && onClose()}
        anchor={shown.position}
        value={sharedValue(writeTargets, (target) => target.due_date)}
        onChange={(due_date) => onUpdate({ due_date })}
        recurrence={sharedValue(writeTargets, (target) => target.recurrence)}
        onRecurrenceChange={(next) => onUpdate(next)}
        ariaLabel={tIssue("changeDueDateAria")}
      />
    );
  }

  /** The shared field options as rows, checked when every target shares the value. */
  const rows = (options: readonly FieldOption[], isChecked: (value: string) => boolean, onSelect: (value: string) => void) =>
    options.map((o) => (
      <CommandItem
        key={o.value}
        value={o.value}
        keywords={[o.label, ...(o.keywords ?? [])]}
        onSelect={() => onSelect(o.value)}
        {...checked(isChecked(o.value))}
      >
        {o.icon}
        {o.labelNode ?? <span className="truncate">{o.label}</span>}
      </CommandItem>
    ));

  let items: React.ReactNode = null;
  switch (field) {
    case "status":
      items = rows(
        statusFieldOptions(tStatus),
        (value) => allTargetsMatch<string>(writeTargets, (target) => target.status, value),
        (value) => apply({ status: value as IssueStatus }),
      );
      break;
    case "priority":
      items = rows(
        priorityFieldOptions(tPriority),
        (value) => allTargetsMatch<string>(writeTargets, (target) => target.priority, value),
        (value) => apply({ priority: value as IssuePriority }),
      );
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
          {rows(
            EFFORT_OPTIONS,
            (value) => allTargetsMatch<string | null>(writeTargets, (target) => target.effort, value),
            (value) => apply({ effort: value as IssueEffort }),
          )}
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
          {rows(
            memberFieldOptions(members),
            (id) => allTargetsMatch<string | null>(writeTargets, (target) => target.assignee_id, id),
            (id) => apply({ assignee_id: id }),
          )}
        </>
      );
      break;
    case "objective": {
      const shared = sharedValue(writeTargets, (target) => target.objective_id);
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
            render={(options) =>
              rows(
                options,
                (id) => shared === id,
                (objective_id) => apply({ objective_id }),
              )
            }
          />
        </>
      );
      break;
    }
    case "category": {
      const toggle = (id: string) =>
        linked(() => {
          for (const [issueId, ids] of toggleCategoryAcross(writeTargets, id)) {
            onSetCategories(ids, issueId);
          }
        });
      items = rows(
        categoryFieldOptions(categories),
        (id) => allTargetsHaveCategory(writeTargets, id),
        toggle,
      );
      break;
    }
  }

  // Quick add on the two fields created from their menu, as in the
  // clickable pickers: here from the L/O shortcut.
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
  // No early return when closed: CommandAnchor keeps the menu through its exit.
  return (
    <CommandAnchor position={position} onClose={onClose}>
      {/* No "Relations" eyebrow: the types name themselves. A selection
          still says how many tickets the choice applies to. */}
      <CommandGroup
        heading={targetCount > 1 ? tBulk("selected", { count: targetCount }) : undefined}
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
