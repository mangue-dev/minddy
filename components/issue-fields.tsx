"use client";

import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Input,
  cn,
} from "mangue-ui";
import { Check, UserCircle2, CalendarDays, Triangle, Target, GitMerge } from "lucide-react";
import {
  STATUSES,
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
import type { Issue, Member, Objective } from "@/lib/types";

function memberLabel(m: Member): string {
  return displayName(m);
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Target className="text-muted-foreground" />
          {current ? current.name : tField("noObjective")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {tField("noObjective")}
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {objectives.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)}>
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: o.color ?? "var(--muted-foreground)" }}
              aria-hidden
            />
            <span className="truncate">{o.name}</span>
            {o.id === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <StatusIndicator status={value} className="size-4" />
          {tStatus(value)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
            <StatusIndicator status={s.value} className="size-4" />
            {tStatus(s.value)}
            {s.value === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <PriorityIndicator priority={value} className="size-4" />
          {tPriority(value)}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p.value} onSelect={() => onChange(p.value)}>
            <PriorityIndicator priority={p.value} className="size-4" />
            {tPriority(p.value)}
            {p.value === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Triangle className="text-muted-foreground" />
          {value ? EFFORT_MAP[value].label : tField("effort")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {tCommon("none")}
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {EFFORTS.map((e) => (
          <DropdownMenuItem key={e.value} onSelect={() => onChange(e.value)}>
            {e.label}
            {e.value === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <UserCircle2 className="text-muted-foreground" />
          {current ? memberLabel(current) : empty}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {empty}
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
            <UserAvatar
              url={m.avatar_url}
              name={displayName(m)}
              seed={m.user_id}
              className="size-5 text-[9px]"
            />
            <span className="truncate">{memberLabel(m)}</span>
            {m.user_id === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <GitMerge className="text-muted-foreground" />
          {current
            ? issueIdentifier(projectKey, current.number)
            : tField("noParent")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {tField("noParent")}
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {options.map((o) => (
          <DropdownMenuItem key={o.id} onSelect={() => onChange(o.id)}>
            <span className="font-mono text-xs text-muted-foreground">
              {issueIdentifier(projectKey, o.number)}
            </span>
            <span className="truncate">{o.title}</span>
            {o.id === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DueDateField({
  value,
  onChange,
  className,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <CalendarDays className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="pl-8"
      />
    </div>
  );
}
