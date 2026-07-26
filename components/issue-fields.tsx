"use client";

import { useTranslations } from "next-intl";
import { Button } from "mangue-ui";
import { UserCircle2, Triangle, Target, GitMerge } from "lucide-react";
import {
  ALL_STATUSES,
  PRIORITIES,
  EFFORTS,
  EFFORT_MAP,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { StatusIndicator, PriorityIndicator } from "@/components/issue-indicators";
import { displayName } from "@/lib/display-name";
import { UserAvatar } from "@/components/user-avatar";
import { DateTimePicker } from "@/components/date-time-picker";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import type { Issue, Member, Objective } from "@/lib/types";

function memberLabel(m: Member): string {
  return displayName(m);
}

/** A small round color dot used for objective/category-style options. */
function Dot({ color }: { color: string | null | undefined }) {
  return (
    <span
      className="size-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
      aria-hidden
    />
  );
}

export function ObjectivePicker({
  value,
  onChange,
  objectives,
  size = "sm",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  objectives: Objective[];
  size?: "sm" | "default";
}) {
  const tField = useTranslations("Field");
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
      noneOption={{ label: tField("noObjective") }}
      trigger={
        <Button variant="outline" size={size}>
          <Target className="text-muted-foreground" />
          {current ? current.name : tField("noObjective")}
        </Button>
      }
    />
  );
}

export function StatusPicker({
  value,
  onChange,
  size = "sm",
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
  size?: "sm" | "default";
}) {
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
      trigger={
        <Button variant="outline" size={size}>
          <StatusIndicator status={value} className="size-4" />
          {tStatus(value)}
        </Button>
      }
    />
  );
}

export function PriorityPicker({
  value,
  onChange,
  size = "sm",
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
  size?: "sm" | "default";
}) {
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
      trigger={
        <Button variant="outline" size={size}>
          <PriorityIndicator priority={value} className="size-4" />
          {tPriority(value)}
        </Button>
      }
    />
  );
}

export function EffortPicker({
  value,
  onChange,
  size = "sm",
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
  size?: "sm" | "default";
}) {
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
      trigger={
        <Button variant="outline" size={size}>
          <Triangle className="text-muted-foreground" />
          {value ? EFFORT_MAP[value].label : tField("effort")}
        </Button>
      }
    />
  );
}

export function AssigneePicker({
  value,
  onChange,
  members,
  size = "sm",
  emptyLabel,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  members: Member[];
  size?: "sm" | "default";
  emptyLabel?: string;
}) {
  const tField = useTranslations("Field");
  const current = members.find((m) => m.user_id === value) ?? null;
  const empty = emptyLabel ?? tField("unassigned");
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
      noneOption={{ label: empty }}
      trigger={
        <Button variant="outline" size={size}>
          <UserCircle2 className="text-muted-foreground" />
          {current ? memberLabel(current) : empty}
        </Button>
      }
    />
  );
}

export function ParentPicker({
  value,
  onChange,
  options,
  projectKey,
  size = "sm",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  /** Eligible parents (top-level issues, excluding self). */
  options: Issue[];
  projectKey: string;
  size?: "sm" | "default";
}) {
  const tField = useTranslations("Field");
  const current = options.find((o) => o.id === value) ?? null;
  const pickerOptions: PickerOption[] = options.map((o) => ({
    value: o.id,
    label: o.title,
    keywords: [issueIdentifier(projectKey, o.number)],
    icon: (
      <span className="font-mono text-xs text-muted-foreground">
        {issueIdentifier(projectKey, o.number)}
      </span>
    ),
  }));
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={pickerOptions}
      noneOption={{ label: tField("noParent") }}
      trigger={
        <Button variant="outline" size={size}>
          <GitMerge className="text-muted-foreground" />
          {current
            ? issueIdentifier(projectKey, current.number)
            : tField("noParent")}
        </Button>
      }
    />
  );
}

export function DueDateField({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  className?: string;
  /** Trigger label when empty (defaults to "Échéance"; objectives pass their own). */
  placeholder?: string;
}) {
  const tField = useTranslations("Field");
  const empty = placeholder ?? tField("dueDate");
  return (
    <DateTimePicker
      variant="field"
      value={value}
      onChange={onChange}
      placeholder={empty}
      ariaLabel={empty}
      className={className}
    />
  );
}
