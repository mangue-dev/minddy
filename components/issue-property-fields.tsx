"use client";

import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "mangue-ui";
import { Check } from "lucide-react";
import { DateTimePicker } from "@/components/date-time-picker";
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

export function StatusValue({
  value,
  onChange,
}: {
  value: IssueStatus;
  onChange: (v: IssueStatus) => void;
}) {
  const t = useTranslations("IssueUI");
  const tStatus = useTranslations("Status");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("changeStatusAria")} className={TRIGGER}>
          <StatusIndicator status={value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
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

export function PriorityValue({
  value,
  onChange,
}: {
  value: IssuePriority;
  onChange: (v: IssuePriority) => void;
}) {
  const t = useTranslations("IssueUI");
  const tPriority = useTranslations("Priority");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("changePriorityAria")} className={TRIGGER}>
          <PriorityIndicator priority={value} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
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

export function EffortValue({
  value,
  onChange,
}: {
  value: IssueEffort | null;
  onChange: (v: IssueEffort | null) => void;
}) {
  const t = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("changeEffortAria")} className={TRIGGER}>
          {value ? (
            <EffortIndicator effort={value} className="text-foreground" />
          ) : (
            <span className="text-muted-foreground">{tCommon("none")}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
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
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {tField("unassigned")}
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
  const t = useTranslations("IssueUI");
  const selected = categories.filter((c) => value.includes(c.id));
  const first = selected[0];
  const extra = selected.length - 1;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("editCategoriesAria")} className={TRIGGER}>
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
            <span className="text-muted-foreground">{t("noneFem")}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {categories.length === 0 ? (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">
            {t("noCategoriesHint")}
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
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={t("changeObjectiveAria")} className={TRIGGER}>
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
            <span className="text-muted-foreground">{tCommon("none")}</span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={() => onChange(null)}>
          {tCommon("none")}
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
