"use client";

// One picker per issue field, for the three surfaces that edit it in place:
//
//   card     the board card's indicators: deferred trigger (a closed picker
//            mounts no menu, MIN-316), clicks kept from the card (which would
//            open the side panel or start a drag), shortcut badge in the tooltip
//   row      the side panel's key/value rows: borderless value, right-aligned
//   compact  the create dialog's inline row: the indicator alone, or with its
//            value on the mobile property tiles (`showValue`); the dialog
//            drives the open state from its own shortcuts
//
// The options come from components/issue-field-options.tsx, shared with the
// shortcut menu, the property menus and the palette.

import { memo, useMemo } from "react";
import { useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tag01Icon, Target01Icon, TriangleIcon, UserCircleIcon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import { Dot } from "@/components/ui/color-dot";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchMultiSelect, SearchSelect } from "@/components/search-select";
import { EffortIndicator, PriorityIndicator, StatusIndicator } from "@/components/issue-indicators";
import { IssueCardAssigneeAvatar, IssueCardCategories, IssueCardEffort } from "@/components/issue-card-face";
import { KEY_FOR_FIELD, type ShortcutField } from "@/components/issue-field-shortcuts";
import { MentionHover } from "@/components/mention-hover";
import { OBJECTIVE_PILL_TRIGGER, ObjectivePill } from "@/components/objective-label";
import { SMART_ASSIGN_ICON } from "@/components/feature-icons";
import { UserAvatar } from "@/components/user-avatar";
import {
  categoryFieldOptions,
  effortFieldOptions,
  memberFieldOptions,
  objectiveFieldOptions,
  priorityFieldOptions,
  statusFieldOptions,
} from "@/components/issue-field-options";
import { displayName } from "@/lib/display-name";
import { EFFORT_MAP, type IssueEffort, type IssuePriority, type IssueStatus } from "@/lib/issue-constants";
import { useCategoryCreateOption, useObjectiveCreateOption } from "@/lib/use-picker-create";
import { useOrderedObjectives } from "@/lib/use-ordered-objectives";
import type { RecurrenceCadence } from "@/lib/recurrence";
import type { Category, Member, Objective } from "@/lib/types";

export type FieldPickerVariant = "card" | "row" | "compact";

/** The trigger chrome of each surface. */
export const FIELD_TRIGGER = {
  card: "-m-0.5 flex items-center rounded-md p-0.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
  /** A roomier hit area for the card's smaller indicators (priority, effort, categories). */
  cardWide:
    "-m-1.5 flex min-w-0 items-center rounded-md p-1.5 outline-none transition-colors hover:bg-muted focus-visible:bg-muted",
  row: "-mr-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted disabled:cursor-default disabled:hover:bg-transparent",
  // On a phone the row is made of 30 px targets, below a comfortable touch
  // size: under `sm` each trigger gains a few pixels.
  compact:
    "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted max-sm:p-2",
} as const;

/** Open state and shortcut badge, driven by a surface with its own shortcuts. */
export interface FieldPickerControl {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutHint?: string;
  /** Compact only: the value's name next to its indicator (mobile property tiles). */
  showValue?: boolean;
}

const stop = (e: React.SyntheticEvent) => e.stopPropagation();

/** Card and row pickers name their hover shortcut; the create dialog passes its own. */
function defaultHint(variant: FieldPickerVariant, field: ShortcutField) {
  return variant === "compact" ? undefined : KEY_FOR_FIELD[field];
}

/** The menu props that differ per surface. `cardAlign` follows the
 *  indicator's side of the card. */
function surfaceProps(variant: FieldPickerVariant, cardAlign: "start" | "end") {
  if (variant === "card") return { deferTrigger: true, stopPropagation: true, align: cardAlign } as const;
  if (variant === "row") return { align: "end" } as const;
  return {};
}

/** A card trigger keeps its click and pointer-down from the card. */
function triggerHandlers(variant: FieldPickerVariant) {
  return variant === "card" ? { onClick: stop, onPointerDown: stop } : {};
}

export const StatusPicker = memo(function StatusPicker({
  variant,
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "status"),
  showValue = false,
}: {
  variant: FieldPickerVariant;
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
} & FieldPickerControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tStatus = useTranslations("Status");
  const options = useMemo(() => statusFieldOptions(tStatus), [tStatus]);
  return (
    <SearchSelect
      {...surfaceProps(variant, "start")}
      value={value}
      onChange={(v) => onChange(v as IssueStatus)}
      options={options}
      tooltip={tField("status")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button
          type="button"
          aria-label={t("fieldValueAria", { field: tField("status"), value: tStatus(value) })}
          className={FIELD_TRIGGER[variant]}
          {...triggerHandlers(variant)}
        >
          <StatusIndicator status={value} />
          {showValue && <span>{tStatus(value)}</span>}
        </button>
      }
    />
  );
});

export const PriorityPicker = memo(function PriorityPicker({
  variant,
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "priority"),
  showValue = false,
}: {
  variant: FieldPickerVariant;
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
} & FieldPickerControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tPriority = useTranslations("Priority");
  const options = useMemo(() => priorityFieldOptions(tPriority), [tPriority]);
  return (
    <SearchSelect
      {...surfaceProps(variant, "start")}
      value={value}
      onChange={(v) => onChange(v as IssuePriority)}
      options={options}
      tooltip={tField("priority")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button
          type="button"
          aria-label={t("fieldValueAria", { field: tField("priority"), value: tPriority(value) })}
          className={variant === "card" ? FIELD_TRIGGER.cardWide : FIELD_TRIGGER[variant]}
          {...triggerHandlers(variant)}
        >
          <PriorityIndicator priority={value} />
          {showValue && <span>{tPriority(value)}</span>}
        </button>
      }
    />
  );
});

/** Built once: the effort scale does not depend on the locale. */
const EFFORT_OPTIONS = effortFieldOptions();

export const EffortPicker = memo(function EffortPicker({
  variant,
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "effort"),
  showValue = false,
}: {
  variant: FieldPickerVariant;
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
} & FieldPickerControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const noneLabel = tField("effortNone");
  let content: React.ReactNode;
  if (variant === "card") {
    content = <IssueCardEffort value={value} />;
  } else if (value) {
    content = <EffortIndicator effort={value} className="text-foreground" />;
  } else if (variant === "row") {
    content = <span className="text-muted-foreground">{noneLabel}</span>;
  } else {
    content = (
      <>
        <HugeiconsIcon icon={TriangleIcon} className="size-[18px] shrink-0 text-muted-foreground" />
        {showValue && <span>{noneLabel}</span>}
      </>
    );
  }
  return (
    <SearchSelect
      {...surfaceProps(variant, "start")}
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={EFFORT_OPTIONS}
      noneOption={{ label: noneLabel }}
      tooltip={tField("effort")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button
          type="button"
          aria-label={t("fieldValueAria", { field: tField("effort"), value: value ? EFFORT_MAP[value].label : noneLabel })}
          className={variant === "card" ? FIELD_TRIGGER.cardWide : FIELD_TRIGGER[variant]}
          {...triggerHandlers(variant)}
        >
          {content}
        </button>
      }
    />
  );
});

const SMART_ASSIGN_GLYPH = (
  <HugeiconsIcon icon={SMART_ASSIGN_ICON} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
);

export const AssigneePicker = memo(function AssigneePicker({
  variant,
  value,
  members,
  onChange,
  smartAssign = false,
  noneLabel,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "assignee"),
  showValue = false,
}: {
  variant: FieldPickerVariant;
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
  /** The project's Smart Assign fills an empty assignee (MIN-811): the empty
      state and the "clear" option read "Smart Assign". */
  smartAssign?: boolean;
  /** Overrides the "clear" option's label (e.g. "No lead" for objectives). */
  noneLabel?: string;
} & FieldPickerControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const current = members.find((m) => m.user_id === value) ?? null;
  const emptyLabel = smartAssign ? tField("smartAssign") : noneLabel ?? tField("unassigned");
  const options = useMemo(() => memberFieldOptions(members), [members]);
  let content: React.ReactNode;
  if (variant === "card") {
    // The picker's own tooltip already names the field: a second, native one
    // with the person's name would stack on top of it.
    content = <IssueCardAssigneeAvatar assignee={current} smartAssign={smartAssign} emptyLabel={emptyLabel} named={false} />;
  } else if (variant === "row") {
    content = current ? (
      <>
        <UserAvatar seed={current.avatar_seed} className="size-5" />
        <span className="truncate">{displayName(current)}</span>
      </>
    ) : smartAssign ? (
      <>
        {SMART_ASSIGN_GLYPH}
        <span className="truncate text-muted-foreground">{emptyLabel}</span>
      </>
    ) : (
      <span className="text-muted-foreground">{emptyLabel}</span>
    );
  } else {
    content = (
      <>
        {current ? (
          <UserAvatar seed={current.avatar_seed} className="size-5" />
        ) : smartAssign ? (
          SMART_ASSIGN_GLYPH
        ) : (
          <HugeiconsIcon icon={UserCircleIcon} strokeWidth={1.75} className="size-[18px] shrink-0 text-muted-foreground" />
        )}
        {showValue && <span>{current ? displayName(current) : emptyLabel}</span>}
      </>
    );
  }
  return (
    <SearchSelect
      {...surfaceProps(variant, "end")}
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{ label: emptyLabel, icon: smartAssign ? SMART_ASSIGN_GLYPH : undefined }}
      tooltip={tField("assignee")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button
          type="button"
          aria-label={t("fieldValueAria", { field: tField("assignee"), value: current ? displayName(current) : emptyLabel })}
          className={
            variant === "card"
              ? "rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
              : FIELD_TRIGGER[variant]
          }
          {...triggerHandlers(variant)}
        >
          {content}
        </button>
      }
    />
  );
});

export const CategoriesPicker = memo(function CategoriesPicker({
  variant,
  categories,
  value,
  onChange,
  projectId,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "category"),
  showValue = false,
}: {
  variant: FieldPickerVariant;
  categories: Pick<Category, "id" | "name" | "color">[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Project where quick add creates the label (absent: no "Add" line). */
  projectId?: string | null;
} & FieldPickerControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const selected = categories.filter((c) => value.includes(c.id));
  const first = selected[0];
  const extra = selected.length - 1;
  const options = useMemo(() => categoryFieldOptions(categories), [categories]);
  const createOption = useCategoryCreateOption({
    projectId,
    categories,
    onCreated: (category) => onChange([...value, category.id]),
  });
  let content: React.ReactNode;
  if (variant === "card") {
    content = <IssueCardCategories categories={categories} selectedIds={value} />;
  } else if (first) {
    content = (
      <>
        <Dot color={first.color} />
        <span className={cn("truncate", variant === "compact" && "max-w-36")}>{first.name}</span>
        {extra > 0 && <span className="shrink-0 text-muted-foreground">+{extra}</span>}
      </>
    );
  } else if (variant === "row") {
    content = <span className="text-muted-foreground">{t("noneFem")}</span>;
  } else {
    content = (
      <>
        <HugeiconsIcon icon={Tag01Icon} className="size-[17px] shrink-0 text-muted-foreground" />
        {showValue && <span>{tField("noCategories")}</span>}
      </>
    );
  }
  return (
    <SearchMultiSelect
      {...surfaceProps(variant, "end")}
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
        <button
          type="button"
          aria-label={t("fieldValueAria", {
            field: tField("categories"),
            value: selected.length ? selected.map((c) => c.name).join(", ") : tField("noCategories"),
          })}
          className={variant === "card" ? FIELD_TRIGGER.cardWide : FIELD_TRIGGER[variant]}
          {...triggerHandlers(variant)}
        >
          {content}
        </button>
      }
    />
  );
});

/** The card has no objective picker of its own: its pill opens the shared
 *  shortcut menu at the pill (see `ObjectiveIndicator` in issue-card.tsx). */
export const ObjectivePicker = memo(function ObjectivePicker({
  variant,
  value,
  objectives,
  onChange,
  projectId,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "objective"),
  showValue = false,
}: {
  variant: Exclude<FieldPickerVariant, "card">;
  value: string | null;
  objectives: Objective[];
  onChange: (v: string | null) => void;
  /** Project where quick add creates the objective (absent: no "Add" line). */
  projectId?: string | null;
} & FieldPickerControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const current = objectives.find((o) => o.id === value) ?? null;
  const ordered = useOrderedObjectives(objectives);
  const options = useMemo(() => objectiveFieldOptions(ordered), [ordered]);
  const createOption = useObjectiveCreateOption({
    projectId,
    onCreated: (objective) => onChange(objective.id),
  });
  const triggerClass = current
    ? cn(OBJECTIVE_PILL_TRIGGER, variant === "compact" && "max-w-48")
    : FIELD_TRIGGER[variant];
  return (
    <SearchSelect
      {...surfaceProps(variant, "end")}
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
          aria-label={t("fieldValueAria", { field: tField("objective"), value: current ? current.name : tCommon("none") })}
          className={triggerClass}
        >
          {current ? (
            // Its card on hover, like a mention of it (MIN-879).
            <MentionHover type="objective" id={current.id} project={current.project_id} disabled={open}>
              <span className="flex min-w-0">
                <ObjectivePill objective={current} />
              </span>
            </MentionHover>
          ) : variant === "row" ? (
            <span className="text-muted-foreground">{tCommon("none")}</span>
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
});

const DUE_DATE_TRIGGER = { card: "chip", row: "value", compact: "ghost" } as const;

export const DueDatePicker = memo(function DueDatePicker({
  variant,
  value,
  onChange,
  recurrence,
  onRecurrenceChange,
  open,
  onOpenChange,
  shortcutHint = defaultHint(variant, "dueDate"),
}: {
  variant: FieldPickerVariant;
  value: string | null;
  onChange: (v: string | null) => void;
  /** Given with `onRecurrenceChange`, the picker offers recurring mode
      (MIN-136): tickets have it, an objective's target date does not. */
  recurrence?: RecurrenceCadence | null;
  onRecurrenceChange?: (next: {
    due_date: string | null;
    recurrence: RecurrenceCadence | null;
  }) => void;
} & Omit<FieldPickerControl, "showValue">) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  // The compact row names the field in its empty trigger, so its tooltip
  // only appears with a shortcut badge to show.
  const tooltip = variant === "compact" && !shortcutHint ? undefined : tField("dueDate");
  return (
    <DateTimePicker
      variant={DUE_DATE_TRIGGER[variant]}
      value={value}
      onChange={onChange}
      recurrence={recurrence}
      onRecurrenceChange={onRecurrenceChange}
      placeholder={variant === "row" ? t("noneFem") : variant === "compact" ? tField("dueDate") : undefined}
      ariaLabel={t("changeDueDateAria")}
      tooltip={tooltip}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      stopPropagation={variant === "card" ? true : undefined}
    />
  );
});
