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
import { Check, UserCircle2, CalendarDays, Gauge } from "lucide-react";
import {
  STATUSES,
  STATUS_MAP,
  PRIORITIES,
  PRIORITY_MAP,
  EFFORTS,
  EFFORT_MAP,
  type IssueStatus,
  type IssuePriority,
  type IssueEffort,
} from "@/lib/issue-constants";
import type { Member } from "@/lib/types";

function memberLabel(m: Member): string {
  return m.full_name || m.email || "Utilisateur";
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
  const Icon = meta.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Icon className={meta.color} />
          {meta.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {STATUSES.map((s) => {
          const SIcon = s.icon;
          return (
            <DropdownMenuItem key={s.value} onSelect={() => onChange(s.value)}>
              <SIcon className={s.color} />
              {s.label}
              {s.value === value && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          );
        })}
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
  const Icon = meta.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Icon className={meta.color} />
          {meta.label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {PRIORITIES.map((p) => {
          const PIcon = p.icon;
          return (
            <DropdownMenuItem key={p.value} onSelect={() => onChange(p.value)}>
              <PIcon className={p.color} />
              {p.label}
              {p.value === value && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          );
        })}
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <Gauge className="text-muted-foreground" />
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
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  members: Member[];
  size?: "sm" | "default";
}) {
  const current = members.find((m) => m.user_id === value) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size}>
          <UserCircle2 className="text-muted-foreground" />
          {current ? memberLabel(current) : "Non assigné"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          Non assigné
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              {(m.full_name || m.email || "?").slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate">{memberLabel(m)}</span>
            {m.user_id === value && <Check className="ml-auto size-4" />}
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
