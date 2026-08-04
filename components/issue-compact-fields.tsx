"use client";

// Compact pickers for the create-issue dialog — the options read as one inline
// row (Figma: assets/figma/New issue minddy.png). Icon-representable fields
// show just their indicator (status/priority, effort triangle, category dot,
// avatar); due date and objective render as bordered pills. Same value/onChange
// contracts as the side-panel fields in issue-property-fields.tsx.

import { useTranslations } from "next-intl";
import { Tag, Target, Triangle, UserCircle2 } from "lucide-react";
import { DateTimePicker } from "@/components/date-time-picker";
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
} from "@/components/issue-indicators";
import { Dot } from "@/components/issue-property-fields";
import {
  useCategoryCreateOption,
  useObjectiveCreateOption,
} from "@/lib/use-picker-create";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import type { RecurrenceCadence } from "@/lib/recurrence";
import type { Category, Member, Objective } from "@/lib/types";

// Au doigt, la rangée d'options est faite de cibles de 30 px, sous le seuil du
// confortable : sous `sm` chaque déclencheur gagne quelques pixels de garde.
const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted max-sm:p-2";
const PILL =
  "flex h-8 items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring max-sm:h-9";

// Lets the create-issue dialog drive each picker's open state from a keyboard
// shortcut and surface the key in the trigger's tooltip. All optional — the
// pickers stay uncontrolled (click to open) when these aren't passed.
type ShortcutControl = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  shortcutHint?: string;
};

export function StatusCompact({
  value,
  onChange,
  open,
  onOpenChange,
  shortcutHint,
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
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const options: PickerOption[] = EFFORTS.map((e) => ({
    value: e.value,
    label: e.label,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueEffort | null)}
      options={options}
      noneOption={{ label: tCommon("none") }}
      tooltip={tField("effort")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeEffortAria")} className={BARE}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <Triangle className="size-[18px] shrink-0 text-muted-foreground" />
          )}
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
}: {
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
  /** Projet où l'ajout rapide crée l'étiquette. */
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
            <Tag className="size-[17px] shrink-0 text-muted-foreground" />
          )}
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
  noneLabel,
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
  /** Overrides the "clear" option's label (e.g. "Sans lead" for objectives). */
  noneLabel?: string;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const current = members.find((m) => m.user_id === value) ?? null;
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
      noneOption={{ label: noneLabel ?? tField("unassigned") }}
      tooltip={tField("assignee")}
      open={open}
      onOpenChange={onOpenChange}
      shortcutHint={shortcutHint}
      trigger={
        <button type="button" aria-label={t("changeAssigneeAria")} className={BARE}>
          {current ? (
            <UserAvatar
              seed={current.avatar_seed}
              className="size-6"
            />
          ) : (
            <UserCircle2
              strokeWidth={1.75}
              className="size-[18px] shrink-0 text-muted-foreground"
            />
          )}
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
  /** Ouvre le mode récurrent du popover (MIN-136). */
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
      variant="field"
      value={value}
      onChange={onChange}
      recurrence={recurrence}
      onRecurrenceChange={onRecurrenceChange}
      placeholder={tField("dueDate")}
      ariaLabel={t("changeDueDateAria")}
      className="h-8 rounded-full max-sm:h-9"
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
}: {
  value: string | null;
  objectives: Objective[];
  onChange: (v: string | null) => void;
  /** Projet où l'ajout rapide crée l'objectif. */
  projectId?: string | null;
} & ShortcutControl) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const current = objectives.find((o) => o.id === value) ?? null;
  const options: PickerOption[] = objectives.map((o) => ({
    value: o.id,
    label: o.name,
    icon: <Dot color={o.color} />,
  }));
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
        <button type="button" aria-label={t("changeObjectiveAria")} className={PILL}>
          {current ? (
            <>
              <Dot color={current.color} />
              <span className="max-w-40 truncate">{current.name}</span>
            </>
          ) : (
            <>
              <Target className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">{tField("objective")}</span>
            </>
          )}
        </button>
      }
    />
  );
}
