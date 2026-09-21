import { getFormatter, getTranslations } from "next-intl/server";
import { Calendar, GitPullRequest, IterationCw, ListChecks, Plus } from "lucide-react";
import { PriorityIndicator, StatusIndicator, EffortIndicator } from "@/components/issue-indicators";
import { UserAvatar } from "@/components/user-avatar";
import { ProjectOrb } from "@/components/project-orb";
import { DEFAULT_CATEGORIES, type DefaultCategoryKey } from "@/lib/default-categories";
import { dueDateFormat, parseDueDate } from "@/lib/due-date";
import type { IssueEffort, IssuePriority, IssueStatus } from "@/lib/issue-constants";
import { NumoFace } from "@/components/numo-face";
import { NotebookFigure } from "./notebook-figure";

/** One ticket of the illustrated board: every field a real card renders. */
type FigureTicket = {
  number: number;
  key: "repro" | "signature" | "retry";
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort;
  category: "bug" | "technical" | "feature";
  /** Assignee's avatar seed — the portrait is drawn from it. */
  assignee: string;
  /** Plan progress badge (ListChecks + done/total), as on the card header. */
  plan?: { done: number; total: number };
  /** Blue cycle icon before the identifier: the ticket is in MY cycle. */
  inCycle?: boolean;
  /** Open pull request: the emerald "PR available" chip, in place of the plan. */
  pr?: boolean;
  /** Due date, ISO date-only, shown as the card's compact chip. */
  dueDate?: string;
};

/** The illustrated board depicts the demo Aurora workspace: its category
    vocabulary (English labels — every capture uses them, whatever the locale)
    with the colors the product seeds on every new project. */
const FIGURE_CATEGORY_LABEL: Record<FigureTicket["category"], string> = {
  bug: "Bug",
  technical: "Technical",
  feature: "Feature",
};

function figureCategoryColor(key: DefaultCategoryKey): string {
  return DEFAULT_CATEGORIES.find((category) => category.key === key)?.color ?? "#6b7280";
}

/** Portraits of three teammates, picked in distinct background families
    (cold / warm / green) — at 24 px, the background is what tells people
    apart, exactly why the demo world spreads its members across the wheel. */
const FIGURE_AVATARS = {
  alice: "alice",
  camille: "camille-aurora",
  tom: "tom",
} as const;

/** The header orb: the same ProjectOrb the app paints next to a project
    name (the sidebar uses this exact size), seeded in the teal family of
    the demo Aurora workspace — the real project's orb hue lives in its
    demo-database id, which this static figure cannot read. */
const FIGURE_ORB_SEED = "bdd736ea-c04b-49f0-9217-6965c2339364";

const FIGURE_TICKETS: FigureTicket[] = [
  {
    number: 7,
    key: "repro",
    status: "todo",
    priority: "medium",
    effort: "s",
    category: "bug",
    assignee: FIGURE_AVATARS.alice,
  },
  {
    number: 8,
    key: "signature",
    status: "in_progress",
    priority: "high",
    effort: "m",
    category: "technical",
    assignee: FIGURE_AVATARS.camille,
    plan: { done: 2, total: 3 },
    inCycle: true,
  },
  {
    number: 9,
    key: "retry",
    status: "in_review",
    priority: "high",
    effort: "s",
    category: "feature",
    assignee: FIGURE_AVATARS.tom,
    pr: true,
    dueDate: "2026-09-25",
  },
];

/** A compact board built from the same status, priority, and effort components as issue cards.
    The tickets mirror the real card layout (identifier + plan + assignee header,
    semibold title over a muted description, status/priority/effort/category
    indicators, due-date chip) and the columns the real KanbanColumn headers. */
export async function BoardFigure() {
  const [t, status, board, tAgent, format] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Status"),
    getTranslations("Board"),
    getTranslations("Agent"),
    getFormatter(),
  ]);
  const columns = (["todo", "in_progress", "in_review"] as const).map((statusValue) => ({
    statusValue,
    tickets: FIGURE_TICKETS.filter((ticket) => ticket.status === statusValue),
  }));
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm" role="img" aria-label={t("feature_board_title")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-medium">
        <ProjectOrb seed={FIGURE_ORB_SEED} className="size-4 shrink-0" />Aurora<span className="text-muted-foreground">/</span>{t("navMenu_tracker_title")}
      </div>
      <div className="grid gap-3 p-3 sm:grid-cols-3">
        {columns.map((column) => (
          <div key={column.statusValue} className="flex min-w-0 flex-col">
            {/* Column header, as KanbanColumn renders it: colored ring, semibold
                label, muted count. */}
            <div className="mb-2 flex items-center gap-2 px-1">
              <StatusIndicator status={column.statusValue} className="size-4" />
              <span className="text-sm font-semibold">{status(column.statusValue)}</span>
              <span className="relative top-px text-xs text-muted-foreground">{column.tickets.length}</span>
            </div>
            <div className="flex flex-col gap-2 rounded-xl p-2">
              {column.tickets.map((ticket) => {
                const due = ticket.dueDate ? parseDueDate(ticket.dueDate) : null;
                return (
                <div key={ticket.number} className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3 text-left shadow-none dark:border-border dark:shadow-xs">
                  {/* Identifier + plan / agent presence / assignee, as on the card header. */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1 font-mono text-[11px] text-muted-foreground">
                      {ticket.inCycle && (
                        <span className="flex shrink-0 items-center text-blue-500 dark:text-blue-400">
                          <IterationCw className="size-3" />
                        </span>
                      )}
                      <span className="truncate">AUR-{ticket.number}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {ticket.plan && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                          <ListChecks className="size-3.5 shrink-0" />
                          <span className="tabular-nums">{ticket.plan.done}/{ticket.plan.total}</span>
                        </span>
                      )}
                      {/* Open pull request — the real card shows this emerald
                          chip in place of the plan indicator. */}
                      {ticket.pr && (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-500">
                          <GitPullRequest className="size-3.5 shrink-0" />
                          <span className="truncate">{tAgent("prBadge")}</span>
                        </span>
                      )}
                      {ticket.assignee && <UserAvatar seed={ticket.assignee} className="size-6" />}
                    </span>
                  </div>
                  {/* Title over a description preview, with the card's tight spacing. */}
                  <div className="-mt-1 flex flex-col gap-0.5">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{t(`heroLoopTask_${ticket.key}`)}</p>
                    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{t(`heroLoopDesc_${ticket.key}`)}</p>
                  </div>
                  {/* Indicators — status · priority · effort · category, edge to edge. */}
                  <div className="flex items-center justify-between pt-0.5">
                    <StatusIndicator status={ticket.status} />
                    <PriorityIndicator priority={ticket.priority} />
                    <EffortIndicator effort={ticket.effort} />
                    <span className="flex min-w-0 items-center gap-1.5 text-xs">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: figureCategoryColor(ticket.category) }} aria-hidden />
                      <span className="truncate">{FIGURE_CATEGORY_LABEL[ticket.category]}</span>
                    </span>
                  </div>
                  {due && (
                    <div className="flex items-center justify-end pt-0.5">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Calendar className="size-3 shrink-0" />
                        {format.dateTime(due, dueDateFormat(due, { compact: true }))}
                      </span>
                    </div>
                  )}
                </div>
                );
              })}
              {/* The column's "new ticket" affordance, always present on the
                  real board — decorative here: no hover, no pointer. */}
              <span className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-6 text-sm font-medium text-muted-foreground">
                <Plus className="size-4" />
                {board("newIssue")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function ScratchpadFigure() {
  const t = await getTranslations("Landing");
  return <NotebookFigure title={t("heroLoopIssueTitle")} tasks={(["repro", "signature", "retry"] as const).map(key => t(`heroLoopTask_${key}`))} />;
}

/** Readable execution steps using the product's task status indicators. */
export async function AgentWorkFigure() {
  const t = await getTranslations("Landing");
  return (
    <div className="rounded-xl border border-border bg-background p-5 text-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-4 text-sm font-medium"><NumoFace className="h-4 w-5" />{t("heroLoopStepRun")}</div>
      <p className="mb-4 text-sm font-medium">{t("heroLoopIssueTitle")}</p>
      <ul className="space-y-4">
        {(["repro", "signature", "retry"] as const).map(key => <li key={key} className="flex items-start gap-3 text-sm"><StatusIndicator status="done" /><span>{t(`heroLoopTask_${key}`)}</span></li>)}
      </ul>
      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">{t("heroLoopRunDetail")}</p>
    </div>
  );
}
