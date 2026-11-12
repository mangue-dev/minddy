"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerTerminal01Icon, GitPullRequestIcon, Mic01Icon, PlusSignIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { EffortIndicator, PriorityIndicator, StatusIndicator } from "@/components/issue-indicators";
import { NumoFace } from "@/components/numo-face";
import { UserAvatar } from "@/components/user-avatar";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import { cn } from "@/lib/utils";

/*
 * The pictures of the mobile welcome slides (MIN-907), drawn with the
 * product's own pieces (status, priority and effort indicators, avatars,
 * Numo's face) around one small story told in the reader's language: an
 * offline mode in progress, a checkout bug, a ticket Numo files, the plan
 * the coding agent works through. They follow the theme through the design
 * tokens. The slide fades their top and bottom into the page; the chat sits
 * at the bottom, the others start at the top or in the middle.
 */

function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-2xl border border-border bg-background p-3.5 shadow-sm", className)}>{children}</div>;
}

function Identifier({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">{children}</span>;
}

type Ticket = {
  id: string;
  title: string;
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort;
  avatar: string;
  category: { label: string; color: string };
};

function TicketCard({ ticket, className }: { ticket: Ticket; className?: string }) {
  return (
    <Card className={cn("space-y-2.5", className)}>
      <div className="flex items-center gap-2">
        <Identifier>{ticket.id}</Identifier>
        <UserAvatar seed={ticket.avatar} alt="" className="ml-auto size-5" />
      </div>
      <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{ticket.title}</p>
      <div className="flex items-center gap-3">
        <StatusIndicator status={ticket.status} className="size-4" />
        <PriorityIndicator priority={ticket.priority} className="size-3.5" />
        <EffortIndicator effort={ticket.effort} className="[&_span]:text-xs [&_svg]:size-3.5" />
        <span className="ml-auto flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("size-2 shrink-0 rounded-full", ticket.category.color)} />
          <span className="truncate">{ticket.category.label}</span>
        </span>
      </div>
    </Card>
  );
}

/** The board on a phone: the tickets in progress. */
function IssuesArt() {
  const t = useTranslations("MobileWelcome.art");
  const tStatus = useTranslations("Status");
  const tCategory = useTranslations("Categories.defaults");
  const tickets: Ticket[] = [
    { id: "MIN-42", title: t("issueOffline"), status: "in_progress", priority: "high", effort: "m", avatar: "camille", category: { label: tCategory("feature"), color: "bg-blue-500" } },
    { id: "MIN-38", title: t("issueCheckout"), status: "in_progress", priority: "urgent", effort: "s", avatar: "tom", category: { label: tCategory("bug"), color: "bg-red-500" } },
    { id: "MIN-51", title: t("issueSettings"), status: "in_progress", priority: "medium", effort: "l", avatar: "alice", category: { label: tCategory("design"), color: "bg-emerald-500" } },
  ];
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-2 px-1">
        <StatusIndicator status="in_progress" className="size-4" />
        <span className="text-sm font-semibold">{tStatus("in_progress")}</span>
        <span className="text-xs font-medium text-muted-foreground tabular-nums">{tickets.length}</span>
      </div>
      {tickets.map((ticket, index) => (
        <TicketCard key={ticket.id} ticket={ticket} className={index === 2 ? "opacity-60" : undefined} />
      ))}
    </div>
  );
}

function Ask({ children }: { children: ReactNode }) {
  return (
    <p className="ml-auto max-w-[80%] rounded-3xl rounded-br-lg bg-primary/15 px-3.5 py-2.5 text-[13px] leading-snug text-foreground">
      {children}
    </p>
  );
}

function Answer({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <NumoFace className="mt-0.5 size-6 shrink-0 text-foreground" outlineWidth={3} />
      <div className="min-w-0 flex-1 space-y-2.5 text-[13px] leading-snug text-foreground">{children}</div>
    </div>
  );
}

/** A conversation with Numo, ending on the ticket it filed. */
function NumoArt() {
  const t = useTranslations("MobileWelcome.art");
  const tAssistant = useTranslations("Assistant");
  return (
    <div className="flex h-full w-full flex-col justify-end gap-3.5">
      {/* The conversation so far, receding. */}
      <div className="space-y-3.5 opacity-50">
        <Ask>{t("askBlocking")}</Ask>
        <Answer>
          <p>{t("answerBlocking")}</p>
        </Answer>
      </div>
      <Ask>{t("askCreate")}</Ask>
      <Answer>
        <p>{t("answerCreate")}</p>
        <Card className="flex items-center gap-2 rounded-xl p-2.5">
          <StatusIndicator status="todo" className="size-4" />
          <Identifier>MIN-43</Identifier>
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{t("issueExport")}</span>
          <UserAvatar seed="tom" alt="" className="size-4" />
        </Card>
      </Answer>
      <div className="flex items-center gap-2.5 rounded-full border border-border bg-background py-2.5 ps-3.5 pe-3 shadow-sm">
        <HugeiconsIcon icon={PlusSignIcon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-[13px] text-muted-foreground">{tAssistant("inputPlaceholder")}</span>
        <HugeiconsIcon icon={Mic01Icon} className="ml-auto size-4 shrink-0 text-muted-foreground" />
      </div>
    </div>
  );
}

type TaskState = "done" | "doing" | "todo";

function TaskBox({ state }: { state: TaskState }) {
  if (state === "done") {
    return (
      <span className="mt-px grid size-4 shrink-0 place-items-center rounded-[5px] bg-primary text-primary-foreground">
        <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span className={cn("mt-px grid size-4 shrink-0 place-items-center rounded-[5px] border-[1.5px]", state === "doing" ? "border-primary" : "border-foreground/25")}>
      {state === "doing" && <span className="size-2 rounded-[2px] bg-primary motion-safe:animate-pulse" />}
    </span>
  );
}

/** The offline-mode ticket's plan, which the coding agent works through. */
function AgentsArt() {
  const t = useTranslations("MobileWelcome.art");
  const tasks: { state: TaskState; label: string }[] = [
    { state: "done", label: t("taskStore") },
    { state: "done", label: t("taskQueue") },
    { state: "doing", label: t("taskSync") },
    { state: "todo", label: t("taskBanner") },
    { state: "todo", label: t("taskTest") },
  ];
  const done = tasks.filter((task) => task.state === "done").length;
  return (
    <div className="flex h-full w-full flex-col justify-center">
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Identifier>MIN-42</Identifier>
          <UserAvatar seed="camille" alt="" className="ml-auto size-5" />
        </div>
        <p className="text-sm font-semibold leading-snug">{t("issueOffline")}</p>
        <div className="flex items-center gap-2.5">
          <Identifier>
            {done}/{tasks.length}
          </Identifier>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${(done / tasks.length) * 100}%` }} />
          </span>
        </div>
        <ul className="space-y-2">
          {tasks.map((task) => (
            <li key={task.label} className="flex items-start gap-2.5 text-xs leading-snug">
              <TaskBox state={task.state} />
              <span className={cn("min-w-0 flex-1", task.state === "done" && "text-muted-foreground line-through", task.state === "doing" && "font-medium")}>
                {task.label}
              </span>
              {/* The agent at work on this task. */}
              {task.state === "doing" && (
                <HugeiconsIcon icon={ComputerTerminal01Icon} className="mt-px size-3.5 shrink-0 text-primary motion-safe:animate-pulse" />
              )}
            </li>
          ))}
        </ul>
      </Card>
      {/* Where the work lands: its pull request, linked to the ticket. */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 shadow-sm">
        <HugeiconsIcon icon={GitPullRequestIcon} className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <Identifier>#128</Identifier>
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{t("prDraft")}</span>
        <span className="size-2 shrink-0 rounded-full bg-amber-500 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

export const WELCOME_ART = {
  issues: IssuesArt,
  numo: NumoArt,
  agents: AgentsArt,
} as const;
