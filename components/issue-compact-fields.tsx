"use client";

// Compact pickers for the create-issue dialog — the options read as one inline
// row (Figma: assets/figma/New issue minddy.png). Icon-representable fields
// show just their indicator (status/priority, effort triangle, category dot,
// avatar). Same value/onChange contracts as the side-panel fields in
// issue-property-fields.tsx.

import { MentionHover } from "@/components/mention-hover";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Heading01Icon, Tag01Icon, Target01Icon, TriangleIcon, UserCircleIcon, Link02Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { useId } from "react";
import { DateTimePicker } from "@/components/date-time-picker";
import { SMART_ASSIGN_ICON, SMART_FILL_ICON } from "@/components/feature-icons";
import {
  SearchSelect,
  SearchMultiSelect,
  type PickerOption,
} from "@/components/search-select";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import {
  StatusIndicator,
  PriorityIndicator,
  EffortIndicator,
  ObjectiveStatusIndicator,
  RelationIcon,
} from "@/components/issue-indicators";
import type { RelationMenuKind } from "@/lib/issue-hierarchy";
import { IssueActionsMenu, type ContextMenuAction } from "@/components/issue-context-menu";
import { Dot } from "@/components/issue-property-fields";
import { OBJECTIVE_PILL_TRIGGER, ObjectiveName, objectivePickerOption, ObjectivePill } from "@/components/objective-label";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import {
  useCategoryCreateOption,
  useObjectiveCreateOption,
} from "@/lib/use-picker-create";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import type { RecurrenceCadence } from "@/lib/recurrence";
import type { Category, Member, Objective } from "@/lib/types";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";


// On the finger, the row of options is made of targets of 30 px, below the threshold of the
// comfortable: under `sm` each trigger gains a few guard pixels.
const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted max-sm:p-2";
const SMART_FILL_PILL =
  "flex h-8 items-center gap-1.5 rounded-full bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 aria-expanded:bg-muted/40 max-sm:h-9";

// Lets the create-issue dialog drive each picker's open state from a keyboard
// shortcut and surface the key in the trigger's tooltip. All optional — the
// pickers stay uncontrolled (click to open) when these aren't passed.
type ShortcutControl = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutHint?: string;
  /** Show the selected value in mobile creation property tiles. */
  showValue?: boolean;
};

export function StatusCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tStatus = useTranslations("Status");
  const options: PickerOption[] = ALL_STATUSES.map((s) => ({
    value: s.value,
    label: tStatus(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueStatus)}
      options={options}
      tooltip={tField("status")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeStatusAria")} className={BARE}>
          <StatusIndicator status={value} />
          {showValue && <span>{tStatus(value)}</span>}
        </button>
      }
    />
  );
}

export function PriorityCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const options: PickerOption[] = PRIORITIES.map((p) => ({
    value: p.value,
    label: tPriority(p.value),
    icon: <PriorityIndicator priority={p.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssuePriority)}
      options={options}
      tooltip={tField("priority")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changePriorityAria")} className={BARE}>
          <PriorityIndicator priority={value} />
          {showValue && <span>{tPriority(value)}</span>}
        </button>
      }
    />
  );
}

export function EffortCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const options: PickerOption[] = EFFORTS.map((e) => ({
    value: e.value,
    label: e.label,
    icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={options}
      noneOption={{ label: tField("effortNone") }}
      tooltip={tField("effort")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeEffortAria")} className={BARE}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <HugeiconsIcon icon={TriangleIcon} className="size-[18px] shrink-0 text-muted-foreground" />
          )}
          {showValue && !value && <span>{tField("effortNone")}</span>}
        </button>
      }
    />
  );
}

export function CategoriesCompact({
  categories,
  value,
  onChange,
  projectId,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Project where quick add creates the label. */
  projectId?: string | null;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const selected = categories.filter((c) => value.includes(c.id));
  const first = selected[0];
  const extra = selected.length - 1;
  const options: PickerOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
    icon: <Dot color={c.color} />,
  }));
  const createOption = useCategoryCreateOption({
    projectId,
    categories,
    onCreated: (category) => onChange([...value, category.id]),
  });
  return (
    <SearchMultiSelect
      values={value}
      onChange={onChange}
      options={options}
      createOption={createOption}
      tooltip={tField("categories")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      emptyText={categories.length === 0 ? t("noCategoriesHint") : undefined}
      trigger={
        <button type="button" aria-label={t("editCategoriesAria")} className={BARE}>
          {first ? (
            <>
              <Dot color={first.color} />
              <span className="max-w-36 truncate">{first.name}</span>
              {extra > 0 && (
                <span className="shrink-0 text-muted-foreground">+{extra}</span>
              )}
            </>
          ) : (
            <HugeiconsIcon icon={Tag01Icon} className="size-[17px] shrink-0 text-muted-foreground" />
          )}
          {showValue && !first && <span>{tField("noCategories")}</span>}
        </button>
      }
    />
  );
}

export function AssigneeCompact({
  value,
  members,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
  noneLabel,
  smartAssign = false,
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
  /** Overrides the "clear" option's label (e.g. "No lead" for objectives). */
  noneLabel?: string;
  /** The project's Smart Assign fills an empty assignee (MIN-811): the
      "clear" option reads "Smart Assign" instead of "Unassigned". */
  smartAssign?: boolean;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const current = members.find((m) => m.user_id === value) ?? null;
  const emptyLabel = smartAssign ? tField("smartAssign") : noneLabel ?? tField("unassigned");
  const emptyIcon = smartAssign ? SMART_ASSIGN_ICON : UserCircleIcon;
  const options: PickerOption[] = members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: (
      <UserAvatar
        seed={m.avatar_seed}
        className="size-5"
      />
    ),
  }));
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{
        label: emptyLabel,
        icon: smartAssign ? (
          <HugeiconsIcon icon={SMART_ASSIGN_ICON} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
        ) : undefined,
      }}
      tooltip={tField("assignee")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeAssigneeAria")} className={BARE}>
          {current ? (
            <UserAvatar
              seed={current.avatar_seed}
              className="size-5"
            />
          ) : (
            <HugeiconsIcon icon={emptyIcon} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
          )}
          {showValue && <span>{current ? displayName(current) : emptyLabel}</span>}
        </button>
      }
    />
  );
}

export function DueDateCompact({
  value,
  onChange,
  recurrence,
  onRecurrenceChange,
  open,
  onOpenChange,
  shortcutHint,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  /** Opens recurring popover mode (MIN-136). */
  recurrence?: RecurrenceCadence | null;
  onRecurrenceChange?: (next: {
    due_date: string | null;
    recurrence: RecurrenceCadence | null;
  }) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  return (
    <DateTimePicker
      variant="ghost"
      value={value}
      onChange={onChange}
      recurrence={recurrence}
      onRecurrenceChange={onRecurrenceChange}
      placeholder={tField("dueDate")}
      ariaLabel={t("changeDueDateAria")}
      open={open}
      onOpenChange={onOpenChange}
      tooltip={shortcutHint ? tField("dueDate") : undefined}
      shortcutHint={shortcutHint}
    />
  );
}

export function ObjectiveCompact({
  value,
  objectives,
  onChange,
  projectId,
  open,
  onOpenChange,
  shortcutHint,
  showValue = false,
}: {
  value: string | null;
  objectives: Objective[];
  onChange: (v: string | null) => void;
  /** Project where quick adding creates the goal. */
  projectId?: string | null;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const current = objectives.find((o) => o.id === value) ?? null;
  const options: PickerOption[] = useOrderedObjectives(objectives).map(objectivePickerOption);
  const createOption = useObjectiveCreateOption({
    projectId,
    onCreated: (objective) => onChange(objective.id),
  });
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{ label: tCommon("none") }}
      createOption={createOption}
      tooltip={tField("objective")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button
          type="button"
          aria-label={t("changeObjectiveAria")}
          className={current ? cn(OBJECTIVE_PILL_TRIGGER, "max-w-48") : BARE}
        >
          {current ? (
            // Its card on hover, like a mention of it (MIN-879).
            <MentionHover type="objective" id={current.id} project={current.project_id} disabled={open}>
              <span className="flex min-w-0">
                <ObjectivePill objective={current} />
              </span>
            </MentionHover>
          ) : (
            <>
              <HugeiconsIcon icon={Target01Icon} className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{tField(showValue ? "noObjective" : "objective")}</span>
            </>
          )}
        </button>
      }
    />
  );
}

/**
 * What the Smart Fill menu sets by hand (MIN-809). Smart Fill only fills what
 * is still empty, so a value chosen here wins and brings its property back
 * into the form row (MIN-746).
 */
export interface SmartFillManualFields {
  priority: IssuePriority;
  onPriorityChange: (v: IssuePriority) => void;
  effort: IssueEffort | null;
  onEffortChange: (v: IssueEffort) => void;
  categories: Category[];
  categoryIds: string[];
  onCategoryIdsChange: (ids: string[]) => void;
  objectives: Objective[];
  objectiveId: string | null;
  onObjectiveChange: (id: string) => void;
  /**
   * Shows the title field Smart Fill would otherwise write (MIN-813). Given
   * only while Smart Fill writes the title; `onTitleFocus` runs once the menu
   * has closed, so the caret lands in the field and not back on the chevron.
   */
  onTitleRequest?: () => void;
  onTitleFocus?: () => void;
  /**
   * The relation types Smart Fill would otherwise link: choosing one opens
   * the picker on its targets. Given only while Smart Fill links related
   * issues; `onRequest` runs once the menu has closed, so the picker keeps
   * the focus.
   */
  relations?: { kinds: readonly RelationMenuKind[]; onRequest: (kind: RelationMenuKind) => void };
}

/**
 * One submenu per property Smart Fill would fill, as the actions of a
 * searchable menu (the issue card's): typing finds a value inside the
 * submenus. Only real values are offered: "no priority", "not set" and "no
 * objective" are exactly what Smart Fill fills, so choosing them here would
 * change nothing. Clearing a value stays in the property's own picker once it
 * is back in the row.
 */
function useSmartFillManualActions(manual: SmartFillManualFields | undefined): ContextMenuAction[] {
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const tRelations = useTranslations("Relations");
  const t = useTranslations("IssueUI");
  const orderedObjectives = useOrderedObjectives(manual?.objectives ?? []);
  if (!manual) return [];
  const actions: ContextMenuAction[] = [];
  if (manual.onTitleRequest) {
    actions.push({
      id: "smart-fill-title",
      label: tField("title"),
      icon: <HugeiconsIcon icon={Heading01Icon} className="size-4 text-muted-foreground" />,
      // The menu has closed: the caret goes to the title field it brought back.
      transfersFocus: true,
      onSelect: () => {
        manual.onTitleRequest?.();
        requestAnimationFrame(() => manual.onTitleFocus?.());
      },
    });
  }
  actions.push(
    {
      id: "smart-fill-priority",
      label: tField("priority"),
      icon: <PriorityIndicator priority={manual.priority} className="size-4" />,
      children: PRIORITIES.filter((p) => p.value !== "none").map((p) => ({
        id: `smart-fill-priority-${p.value}`,
        label: tPriority(p.value),
        icon: <PriorityIndicator priority={p.value} className="size-4" />,
        checked: manual.priority === p.value,
        onSelect: () => manual.onPriorityChange(p.value),
      })),
    },
    {
      id: "smart-fill-effort",
      label: tField("effort"),
      icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />,
      children: EFFORTS.map((e) => ({
        id: `smart-fill-effort-${e.value}`,
        label: e.label,
        icon: <HugeiconsIcon icon={TriangleIcon} className="size-4 text-muted-foreground" />,
        checked: manual.effort === e.value,
        onSelect: () => manual.onEffortChange(e.value),
      })),
    },
    {
      id: "smart-fill-categories",
      label: tField("categories"),
      icon: <HugeiconsIcon icon={Tag01Icon} className="size-4 text-muted-foreground" />,
      children: manual.categories.length === 0
        ? [{ id: "smart-fill-no-categories", label: t("noCategoriesHint"), disabled: true }]
        : manual.categories.map((c) => {
            const on = manual.categoryIds.includes(c.id);
            return {
              id: `smart-fill-category-${c.id}`,
              label: c.name,
              icon: <Dot color={c.color} />,
              checked: on,
              // Several categories can apply: the menu stays open.
              keepOpen: true,
              onSelect: () => manual.onCategoryIdsChange(on
                ? manual.categoryIds.filter((id) => id !== c.id)
                : [...manual.categoryIds, c.id]),
            };
          }),
    },
  );
  if (orderedObjectives.length > 0) {
    actions.push({
      id: "smart-fill-objective",
      label: tField("objective"),
      icon: <HugeiconsIcon icon={Target01Icon} className="size-4 text-muted-foreground" />,
      children: orderedObjectives.map((o) => ({
        id: `smart-fill-objective-${o.id}`,
        label: o.name,
        labelNode: <ObjectiveName objective={o} />,
        icon: <ObjectiveStatusIndicator status={o.status} className="size-4" />,
        checked: manual.objectiveId === o.id,
        onSelect: () => manual.onObjectiveChange(o.id),
      })),
    });
  }
  const relations = manual.relations;
  if (relations && relations.kinds.length > 0) {
    actions.push({
      id: "smart-fill-relations",
      label: tRelations("relations"),
      icon: <HugeiconsIcon icon={Link02Icon} className="size-4 text-muted-foreground" />,
      children: relations.kinds.map((kind) => ({
        id: `smart-fill-relation-${kind}`,
        label: tRelations(kind),
        icon: <RelationIcon relation={kind} className="size-4" />,
        // The palette opens on this type's targets once the menu has closed.
        transfersFocus: true,
        onSelect: () => relations.onRequest(kind),
      })),
    });
  }
  return actions;
}

/**
 * Desktop uses a split badge: the left half turns Smart Fill on or off, the
 * chevron sets one of its properties by hand (MIN-809). Mobile creation uses a
 * full-width labeled switch with the same menu beside it.
 */
export function SmartFillCompact({
  value,
  onChange,
  fullWidth = false,
  writesTitle = false,
  manual,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  fullWidth?: boolean;
  /** The account lets Smart Fill write an empty title (MIN-798). */
  writesTitle?: boolean;
  /** Values the chevron menu sets by hand; without it, the badge is a toggle alone. */
  manual?: SmartFillManualFields;
}) {
  const t = useTranslations("IssueUI");
  const id = useId();
  const actions = useSmartFillManualActions(manual);
  const menu = (trigger: React.ReactNode) => (
    <IssueActionsMenu trigger={trigger} actions={actions} align="end" searchable />
  );
  if (fullWidth) return <div className="creation-smart-fill">
    <label htmlFor={id} className="flex min-w-0 flex-1 items-center gap-2 text-sm">
      <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />{t("smartFillChip")}
    </label>
    {manual && menu(
      <button type="button" aria-label={t("smartFillManualAria")} className={BARE}>
        <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 text-muted-foreground" />
      </button>,
    )}
    <Switch id={id} checked={value} onCheckedChange={onChange} />
  </div>;
  // Both halves share the badge's tint, so on or off they read as one chip.
  const tint = value
    ? "bg-primary/10 text-primary hover:bg-primary/15 aria-expanded:bg-primary/15"
    : "text-muted-foreground";
  const toggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-pressed={value}
          onClick={() => onChange(!value)}
          className={cn(SMART_FILL_PILL, tint, manual && "rounded-r-none pr-2")}
        >
          <HugeiconsIcon icon={SMART_FILL_ICON} className="size-4 shrink-0" />
          <span>{t("smartFillChip")}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {value
          ? writesTitle ? t("smartFillOnTitleHint") : t("smartFillOnHint")
          : t("smartFillOffHint")}
      </TooltipContent>
    </Tooltip>
  );
  if (!manual) return toggle;
  return (
    <div data-slot="smart-fill-split" className="inline-flex gap-px">
      {toggle}
      <Tooltip>
        {menu(
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={t("smartFillManualAria")}
              className={cn(SMART_FILL_PILL, tint, "rounded-l-none px-2")}
            >
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-4 shrink-0" />
            </button>
          </TooltipTrigger>,
        )}
        <TooltipContent>{t("smartFillManualAria")}</TooltipContent>
      </Tooltip>
    </div>
  );
}
