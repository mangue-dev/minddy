"use client";

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
  STATUS_MAP,
  PRIORITIES,
  PRIORITY_MAP,
  EFFORTS,
  EFFORT_MAP,
  issueIdentifier,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import { StatusIndicator, PriorityIndicator } from "@/components/issue-indicators";
import { initials } from "@/lib/avatar";
import { displayName } from "@/lib/display-name";
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
  const current = objectives.find((o) => o.id === value) ?? null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Target className="text-muted-foreground" />
          {current ? current.name : "Aucun objectif"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          Aucun objectif
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
  const meta = STATUS_MAP[value];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <StatusIndicator status={value} className="size-4" />
          {meta.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {STATUSES.map((s) => (
          <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
            <StatusIndicator status={s.value} className="size-4" />
            {s.label}
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
  const meta = PRIORITY_MAP[value];
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <PriorityIndicator priority={value} className="size-4" />
          {meta.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p.value} onSelect={() => onChange(p.value)}>
            <PriorityIndicator priority={p.value} className="size-4" />
            {p.label}
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Triangle className="text-muted-foreground" />
          {value ? EFFORT_MAP[value].label : "Effort"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-40">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          Aucun
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
  emptyLabel = "Non assigné",
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  members: Member[];
  size?: "sm" | "default";
  emptyLabel?: string;
}) {
  const current = members.find((m) => m.user_id === value) ?? null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <UserCircle2 className="text-muted-foreground" />
          {current ? memberLabel(current) : emptyLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {emptyLabel}
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {initials(displayName(m))}
            </span>
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
  const current = options.find((o) => o.id === value) ?? null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <GitMerge className="text-muted-foreground" />
          {current
            ? issueIdentifier(projectKey, current.number)
            : "Aucun parent"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          Aucun parent
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
