"use client";

import { useTranslations } from "next-intl";
import { DateTimePicker } from "@/components/date-time-picker";
import {
  SearchSelect,
  SearchMultiSelect,
  type PickerOption,
} from "@/components/search-select";
import {
  STATUSES,
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
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import type { Category, Member, Objective } from "@/lib/types";

/* Borderless key/value fields for the issue panel — the value control has no
   button chrome (matches the inline pickers on the issue cards). Right-aligned;
   opens a searchable dropdown on click. */

const TRIGGER =
  "-mr-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

function Dot({ color }: { color: string | null | undefined }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      aria-hidden
    />
  );
}

export function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <span className="shrink-0 text-sm text-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 items-center justify-end">{children}</div>
    </div>
  );
}

export function StatusValue({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
}) {
  const t = useTranslations("IssueUI");
  const tStatus = useTranslations("Status");
  const options: PickerOption[] = STATUSES.map((s) => ({
    value: s.value,
    label: tStatus(s.value),
    icon: <StatusIndicator status={s.value} className="size-4" />,
  }));
  return (
    <SearchSelect
      value={value}
      onChange={(v) => onChange(v as IssueStatus)}
      options={options}
      align="end"
      trigger={
        <button type="button" aria-label={t("changeStatusAria")} className={TRIGGER}>
          <StatusIndicator status={value} />
        </button>
      }
    />
  );
}

export function PriorityValue({
  value,
  onChange,
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
}) {
  const t = useTranslations("IssueUI");
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
      align="end"
      trigger={
        <button type="button" aria-label={t("changePriorityAria")} className={TRIGGER}>
          <PriorityIndicator priority={value} />
        </button>
      }
    />
  );
}

export function EffortValue({
  value,
  onChange,
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
}) {
  const t = useTranslations("IssueUI");
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
      align="end"
      trigger={
        <button type="button" aria-label={t("changeEffortAria")} className={TRIGGER}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <span className="text-muted-foreground">{tCommon("none")}</span>
          )}
        </button>
      }
    />
  );
}

export function AssigneeValue({
  value,
  members,
  onChange,
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
}) {
  const tField = useTranslations("Field");
  const t = useTranslations("IssueUI");
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
      align="end"
      trigger={
        <button type="button" aria-label={t("changeAssigneeAria")} className={TRIGGER}>
          {current ? (
            <>
              <UserAvatar
                url={current.avatar_url}
                name={displayName(current)}
                seed={current.user_id}
                className="size-5 text-[9px]"
              />
              <span className="truncate">{displayName(current)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{tField("unassigned")}</span>
          )}
        </button>
      }
    />
  );
}

export function CategoryValue({
  categories,
  value,
  onChange,
}: {
  categories: Category[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const t = useTranslations("IssueUI");
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
      align="end"
      emptyText={categories.length === 0 ? t("noCategoriesHint") : undefined}
      trigger={
        <button type="button" aria-label={t("editCategoriesAria")} className={TRIGGER}>
          {first ? (
            <>
              <Dot color={first.color} />
              <span className="truncate">{first.name}</span>
              {extra > 0 && (
                <span className="shrink-0 text-muted-foreground">+{extra}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">{t("noneFem")}</span>
          )}
        </button>
      }
    />
  );
}

export function DueDateValue({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
  return (
    <DateTimePicker
      variant="value"
      value={value}
      onChange={onChange}
      placeholder={t("noneFem")}
      ariaLabel={t("changeDueDateAria")}
    />
  );
}

export function ObjectiveValue({
  value,
  objectives,
  onChange,
}: {
  value: string | null;
  objectives: Objective[];
  onChange: (v: string | null) => void;
}) {
  const t = useTranslations("IssueUI");
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
      align="end"
      trigger={
        <button type="button" aria-label={t("changeObjectiveAria")} className={TRIGGER}>
          {current ? (
            <>
              <Dot color={current.color} />
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{tCommon("none")}</span>
          )}
        </button>
      }
    />
  );
}
