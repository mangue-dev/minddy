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
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import type { Category, Member, Objective } from "@/lib/types";

const BARE =
  "flex items-center gap-1.5 rounded-md p-1.5 text-sm text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";
const PILL =
  "flex h-8 items-center gap-1.5 rounded-full border border-input bg-transparent px-3 text-sm text-foreground outline-none transition-colors hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:border-ring";

export function StatusCompact({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
}) {
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
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
}) {
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
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
}) {
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
      trigger={
        <button type="button" aria-label={t("changeEffortAria")} className={BARE}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <Triangle className="size-3.5 shrink-0 text-muted-foreground" />
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
}: {
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
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
  return (
    <SearchMultiSelect
      values={value}
      onChange={onChange}
      options={options}
      tooltip={tField("categories")}
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
            <Tag className="size-4 shrink-0 text-muted-foreground" />
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
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const current = members.find((m) => m.user_id === value) ?? null;
  const options: PickerOption[] = members.map((m) => ({
    value: m.user_id,
    label: displayName(m),
    keywords: m.email ? [m.email] : undefined,
    icon: (
      <UserAvatar
        url={m.avatar_url}
        name={displayName(m)}
        seed={m.user_id}
        className="size-5 text-[9px]"
      />
    ),
  }));
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{ label: tField("unassigned") }}
      tooltip={tField("assignee")}
      trigger={
        <button type="button" aria-label={t("changeAssigneeAria")} className={BARE}>
          {current ? (
            <UserAvatar
              url={current.avatar_url}
              name={displayName(current)}
              seed={current.user_id}
              className="size-6 text-[10px]"
            />
          ) : (
            <UserCircle2 className="size-5 shrink-0 text-muted-foreground" />
          )}
        </button>
      }
    />
  );
}

export function DueDateCompact({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  return (
    <DateTimePicker
      variant="field"
      value={value}
      onChange={onChange}
      placeholder={tField("dueDate")}
      ariaLabel={t("changeDueDateAria")}
      className="h-8 rounded-full"
    />
  );
}

export function ObjectiveCompact({
  value,
  objectives,
  onChange,
}: {
  value: string | null;
  objectives: Objective[];
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tField = useTranslations("Field");
  const tCommon = useTranslations("Common");
  const current = objectives.find((o) => o.id === value) ?? null;
  const options: PickerOption[] = objectives.map((o) => ({
    value: o.id,
    label: o.name,
    icon: <Dot color={o.color} />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      noneOption={{ label: tCommon("none") }}
      tooltip={tField("objective")}
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
