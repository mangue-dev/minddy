"use client";

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  cn,
} from "mangue-ui";
import { Check } from "lucide-react";
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
import { avatarColor, initials } from "@/lib/avatar";
import { displayName } from "@/lib/display-name";
import type { Category, Member, Objective } from "@/lib/types";

/* Borderless key/value fields for the issue panel — the value control has no
   button chrome (matches the inline pickers on the issue cards). Right-aligned;
   opens a dropdown/popover on click. */

const TRIGGER =
  "-mr-1.5 flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm whitespace-nowrap text-foreground outline-none transition-colors hover:bg-muted focus-visible:bg-muted";

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

function formatDue(due: string): string {
  return new Date(due + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function StatusValue({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Changer le statut" className={TRIGGER}>
          <StatusIndicator status={value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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

export function PriorityValue({
  value,
  onChange,
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Changer la priorité" className={TRIGGER}>
          <PriorityIndicator priority={value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
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

export function EffortValue({
  value,
  onChange,
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
}) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Changer l'effort" className={TRIGGER}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <span className="text-muted-foreground">Aucun</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
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

export function AssigneeValue({
  value,
  members,
  onChange,
}: {
  value: string | null;
  members: Member[];
  onChange: (v: string | null) => void;
}) {
  const current = members.find((m) => m.user_id === value) ?? null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Changer l'assigné" className={TRIGGER}>
          {current ? (
            <>
              <span
                className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ backgroundColor: avatarColor(current.user_id) }}
                aria-hidden
              >
                {initials(displayName(current))}
              </span>
              <span className="truncate">{displayName(current)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Non assigné</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          Non assigné
          {value === null && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        {members.map((m) => (
          <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
            <span
              className="flex size-5 items-center justify-center rounded-full text-[9px] font-semibold text-white"
              style={{ backgroundColor: avatarColor(m.user_id) }}
              aria-hidden
            >
              {initials(displayName(m))}
            </span>
            <span className="truncate">{displayName(m)}</span>
            {m.user_id === value && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const selected = categories.filter((c) => value.includes(c.id));
  const first = selected[0];
  const extra = selected.length - 1;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Modifier les catégories" className={TRIGGER}>
          {first ? (
            <>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: first.color }}
                aria-hidden
              />
              <span className="truncate">{first.name}</span>
              {extra > 0 && (
                <span className="shrink-0 text-muted-foreground">+{extra}</span>
              )}
            </>
          ) : (
            <span className="text-muted-foreground">Aucune</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {categories.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            Aucune catégorie. Crée-en dans les Paramètres.
          </div>
        ) : (
          categories.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onSelect={(e) => {
                e.preventDefault();
                toggle(c.id);
              }}
            >
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: c.color }}
                aria-hidden
              />
              <span className="truncate">{c.name}</span>
              {value.includes(c.id) && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DueDateValue({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Changer l'échéance" className={TRIGGER}>
          {value ? formatDue(value) : <span className="text-muted-foreground">Aucune</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto p-2">
        <div className="flex flex-col gap-2">
          <input
            type="date"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="rounded-md border border-input bg-transparent px-2 py-1 text-sm outline-none focus-visible:border-ring"
          />
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Retirer l&apos;échéance
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
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
  const current = objectives.find((o) => o.id === value) ?? null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Changer l'objectif" className={TRIGGER}>
          {current ? (
            <>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: current.color ?? "var(--muted-foreground)" }}
                aria-hidden
              />
              <span className="truncate">{current.name}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Aucun</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          Aucun
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
