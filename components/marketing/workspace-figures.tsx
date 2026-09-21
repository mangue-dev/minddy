import { getFormatter, getTranslations } from "next-intl/server";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownUp,
  ArrowUpDown,
  Calendar,
  CalendarDays,
  ChevronRight,
  Database,
  FileText,
  Filter,
  GitPullRequest,
  IterationCw,
  ListChecks,
  ListFilter,
  Plus,
  Search,
  Settings2,
  Target,
  Users,
} from "lucide-react";
import { PriorityIndicator, StatusIndicator, EffortIndicator, ObjectiveStatusIndicator } from "@/components/issue-indicators";
import { MentionChip } from "@/components/mention-chip";
import { ProgressRing } from "@/components/progress-ring";
import { SmartAssignIcon, SmartFillIcon } from "@/components/smart-icons";
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
  key: "flicker" | "palette" | "sidebar";
  status: IssueStatus;
  priority: IssuePriority;
  effort: IssueEffort;
  category: "bug" | "feature" | "improvement";
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
    with the colors the product seeds on every new project. The three tickets
    each carry a different theme — display bug, keyboard feature, workspace
    improvement — like a board that lives through several kinds of work. */
const FIGURE_CATEGORY_LABEL: Record<FigureTicket["category"], string> = {
  bug: "Bug",
  feature: "Feature",
  improvement: "Improvement",
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
    key: "flicker",
    status: "todo",
    priority: "urgent",
    effort: "s",
    category: "bug",
    assignee: FIGURE_AVATARS.alice,
  },
  {
    number: 8,
    key: "palette",
    status: "in_progress",
    priority: "high",
    effort: "m",
    category: "feature",
    assignee: FIGURE_AVATARS.camille,
    plan: { done: 2, total: 6 },
    inCycle: true,
  },
  {
    number: 9,
    key: "sidebar",
    status: "in_review",
    priority: "low",
    effort: "xs",
    category: "improvement",
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
                    <p className="line-clamp-2 text-sm font-semibold leading-snug">{t(`boardTask_${ticket.key}`)}</p>
                    <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">{t(`boardDesc_${ticket.key}`)}</p>
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

/** The figure's page tree: two regular pages — one carrying subpages — and the
    database whose table is shown on the right, open. The chevron state is
    per-line: expanded, collapsed, or no children (invisible, as in the tree). */
type FigureTreeLine = {
  /** i18n key suffix, as in `pagesFigure_<key>`. */
  key: "spec" | "guidelines" | "checklist" | "retro" | "launch";
  chevron: "open" | "closed" | "none";
  depth: number;
  active: boolean;
  /** A database page: the Database icon, not FileText. */
  database?: boolean;
};

const FIGURE_TREE: readonly FigureTreeLine[] = [
  { key: "spec", chevron: "open", depth: 0, active: false },
  { key: "guidelines", chevron: "none", depth: 1, active: false },
  { key: "checklist", chevron: "none", depth: 1, active: false },
  { key: "retro", chevron: "closed", depth: 0, active: false },
  { key: "launch", chevron: "closed", depth: 0, active: true, database: true },
];

/** Rows of the illustrated database: a launch plan tracked with the three
    column types a team reaches for first — a single-select status, owners
    (one row splits the work, as the real table stacks avatars) and a date.
    Option names reuse the Status vocabulary; colors come from the fixed
    label palette the product picks option colors from. */
const FIGURE_ENTRIES = [
  { key: "entry1", status: "in_progress", owners: ["camille", "alice"], due: "2026-09-24" },
  { key: "entry2", status: "done", owners: ["alice"], due: "2026-09-19" },
  { key: "entry3", status: "todo", owners: ["tom"], due: "2026-09-26" },
] as const satisfies ReadonlyArray<{ key: string; status: IssueStatus; owners: (keyof typeof FIGURE_AVATARS)[]; due: string }>;

const FIGURE_STATUS_COLORS: Record<FigureStatusKey, string> = {
  todo: "#eab308",
  in_progress: "#3b82f6",
  done: "#22c55e",
};
type FigureStatusKey = (typeof FIGURE_ENTRIES)[number]["status"];

/** A select badge as the table cells render it: pill for a single select,
    tinted background, text mixed from the option color. */
function FigureOptionBadge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className="inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-[color:color-mix(in_oklab,var(--option-color)_75%,black)] dark:text-[color:color-mix(in_oklab,var(--option-color)_80%,white)]"
      style={
        {
          "--option-color": color,
          backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)`,
        } as CSSProperties
      }
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

/** One tree line, as the page tree renders it: chevron, page or database icon,
    title (medium weight for the open page), one indent step per level. */
function FigureTreeLine({ label, database, depth, chevron, active }: {
  label: string;
  database?: boolean;
  depth: number;
  chevron: "open" | "closed" | "none";
  active?: boolean;
}) {
  return (
    <li className="flex items-center gap-1 py-1 pr-2" style={{ paddingLeft: 10 + depth * 12 }}>
      <ChevronRight
        aria-hidden
        className={`size-2.5 shrink-0 text-muted-foreground transition-transform ${chevron === "open" ? "rotate-90" : ""} ${chevron === "none" ? "invisible" : ""}`}
      />
      {database ? <Database className="size-3 shrink-0 text-muted-foreground" /> : <FileText className="size-3 shrink-0 text-muted-foreground" />}
      <span className={`min-w-0 truncate text-[11px] leading-4 ${active ? "font-medium" : ""}`}>{label}</span>
    </li>
  );
}

/** The Pages surface: the project's tree of pages and subpages on the left —
    the wiki a Notion user recognizes — and, opened on the right, one of its
    page databases: column headers with their type icons, entries as rows,
    the trailing "+" that adds a column. Built from the same components as
    the real Pages shell (tree icons, avatars, select badges). */
export async function PagesFigure() {
  const [t, tDb, tStatus, format] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("PageDatabase"),
    getTranslations("Status"),
    getFormatter(),
  ]);
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm" role="img" aria-label={t("pagesFigure_alt")}>
      {/* Header, as the Pages tab renders it: project orb, name, section. */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-medium">
        <ProjectOrb seed={FIGURE_ORB_SEED} className="size-4 shrink-0" />Aurora<span className="text-muted-foreground">/</span>{t("navMenu_pages_title")}
      </div>
      <div className="flex items-stretch">
        {/* The tree panel, as SecondarySidebar shows it: a "Pages" title with
            the + create button (the menu offering a page or a database),
            then the tree. The card spans the full grid width, so the tree
            keeps the proportion the app gives it (about a fifth of the row). */}
        <div className="w-28 shrink-0 border-r border-border/60 py-2 sm:w-36 lg:w-44">
          <div className="flex items-center justify-between pb-1 pl-3 pr-2">
            <span className="text-[11px] font-medium text-muted-foreground">{t("navMenu_pages_title")}</span>
            <Plus className="size-3.5 text-muted-foreground" aria-hidden />
          </div>
          <ul>
            {FIGURE_TREE.map(line => (
              <FigureTreeLine key={line.key} label={t(`pagesFigure_${line.key}`)}
                database={line.database ?? false} depth={line.depth} chevron={line.chevron} active={line.active} />
            ))}
          </ul>
        </div>
        {/* The database view of the active tree line, as PageDatabaseView
            renders it: toolbar (filter, sort, search, columns, New), a title
            column without icon, typed columns, the trailing "+" column. The
            owner and due columns appear from sm: below, a phone width keeps
            the name and status readable instead of clipping every cell. */}
        <div className="min-w-0 flex-1 py-2 pl-1 pr-2">
          <div className="flex items-center justify-end gap-1 pb-1.5">
            <Filter className="size-3.5 text-muted-foreground" aria-hidden />
            <ArrowDownUp className="size-3.5 text-muted-foreground" aria-hidden />
            <Search className="size-3.5 text-muted-foreground" aria-hidden />
            <Settings2 className="size-3.5 text-muted-foreground" aria-hidden />
            <span className="ml-2 flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground">
              <Plus className="size-3" aria-hidden />{tDb("new")}
            </span>
          </div>
          <div className="flex items-center border-b border-border/50 text-[11px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate px-2 py-1.5">{tDb("name")}</span>
            <span className="flex w-20 shrink-0 items-center gap-1 px-1 py-1.5 sm:w-[6.5rem]"><ListFilter className="size-3 shrink-0" aria-hidden /><span className="truncate">{t("pagesFigure_colStatus")}</span></span>
            <span className="hidden w-16 shrink-0 items-center gap-1 px-1 py-1.5 sm:flex"><Users className="size-3 shrink-0" aria-hidden /><span className="truncate">{t("pagesFigure_colOwner")}</span></span>
            <span className="hidden w-20 shrink-0 items-center gap-1 px-1 py-1.5 sm:flex"><CalendarDays className="size-3 shrink-0" aria-hidden /><span className="truncate">{t("pagesFigure_colDue")}</span></span>
            <span className="flex w-5 shrink-0 items-center justify-center"><Plus className="size-3 text-muted-foreground" aria-hidden /></span>
          </div>
          {FIGURE_ENTRIES.map(entry => {
            const due = parseDueDate(entry.due);
            return (
              <div key={entry.key} className="flex h-10 items-center border-b border-border/40">
                <span className="flex min-w-0 flex-1 items-center gap-1.5 px-2">
                  <FileText className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 truncate text-[11px]">{t(`pagesFigure_${entry.key}`)}</span>
                </span>
                <span className="flex w-20 shrink-0 items-center px-1 sm:w-[6.5rem]">
                  <FigureOptionBadge color={FIGURE_STATUS_COLORS[entry.status]}>{tStatus(entry.status)}</FigureOptionBadge>
                </span>
                <span className="hidden w-16 shrink-0 items-center px-1 sm:flex">
                  <span className="flex -space-x-1">
                    {entry.owners.map(seed => <UserAvatar key={seed} seed={seed} className="size-4 ring-2 ring-background" />)}
                  </span>
                </span>
                <span className="hidden w-20 shrink-0 px-1 text-[11px] text-muted-foreground sm:block">
                  {due && format.dateTime(due, dueDateFormat(due, { compact: true }))}
                </span>
                <span className="w-5 shrink-0" />
              </div>
            );
          })}
          <span className="flex items-center gap-1.5 py-2 pl-2 text-[11px] text-muted-foreground">
            <Plus className="size-3" aria-hidden />{tDb("newEntry")}
          </span>
        </div>
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

/** The three Smart automations acting on one incoming ticket: Smart Fill
    completes its properties, Smart Assign picks its teammate from the
    assignment rules, and the Smart sort places it first in Triage. The
    subject card mirrors IssueCardBody (identifier + assignee header,
    semibold title, status/priority/effort/category indicators); the journal
    lines reuse the product's own words — the "Smart-fill" chip, the "Smart"
    sort, the assignment rules. */
export async function SmartFigure() {
  const [t, tIssueUI] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("IssueUI"),
  ]);
  return (
    <div className="w-full rounded-xl border border-border bg-background p-5 text-foreground shadow-sm" role="img" aria-label={t("smartTitle")}>
      <div className="mb-4 border-b border-border pb-4 text-sm font-medium">
        {t("smartFigureHeader")}
      </div>
      {/* The incoming ticket, as the board card renders it. */}
      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">AUR-10</span>
          <UserAvatar seed={FIGURE_AVATARS.tom} className="size-6" />
        </div>
        <p className="-mt-1 text-sm font-semibold leading-snug">{t("smartFigureTicket")}</p>
        <div className="flex items-center justify-between pt-0.5">
          <StatusIndicator status="triage" />
          <PriorityIndicator priority="urgent" />
          <EffortIndicator effort="m" />
          <span className="flex min-w-0 items-center gap-1.5 text-xs">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: figureCategoryColor("bug") }} aria-hidden />
            <span className="truncate">{FIGURE_CATEGORY_LABEL.bug}</span>
          </span>
        </div>
      </div>
      {/* The three journal moments, in the product's own words. */}
      <ul className="mt-4 space-y-3">
        <li className="flex items-center gap-3">
          <span className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 text-xs font-medium text-primary">
            <SmartFillIcon className="h-3 w-6 shrink-0" />
            {tIssueUI("smartFillChip")}
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">{t("smartFigureFilled")}</span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 text-xs font-medium text-primary">
            <SmartAssignIcon className="size-3.5 shrink-0" />
            {t("feature_smartAssign_title")}
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">
            {t.rich("smartFigureAssigned", {
              tom: (chunks) => (
                <MentionChip
                  type="member"
                  id={FIGURE_AVATARS.tom}
                  label={typeof chunks === "string" ? chunks : "Tom"}
                  avatarSeed={FIGURE_AVATARS.tom}
                />
              ),
            })}
          </span>
        </li>
        <li className="flex items-center gap-3">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
            <ArrowUpDown className="size-3.5" />
          </span>
          <span className="min-w-0 text-sm text-muted-foreground">{t("smartFigureTriage")}</span>
        </li>
      </ul>
    </div>
  );
}

/** One objective as ObjectiveBoardHeader presents it: a color dot over the
    name with its status, then the three indicator clusters — the
    effort-weighted progress ring with the unweighted completed count, the
    lead's avatar, the target date — above the attached issues that feed the
    ring. Reuses the product's own labels (Progress, Lead, Target date). */
export async function ObjectivesFigure() {
  const [t, tObjectives, tObjectiveStatus] = await Promise.all([
    getTranslations("Landing"),
    getTranslations("Objectives"),
    getTranslations("ObjectiveStatus"),
  ]);
  const issues = [
    { key: "objectiveFigureIssue1", status: "done", effort: "m" },
    { key: "objectiveFigureIssue2", status: "in_progress", effort: "l" },
    { key: "objectiveFigureIssue3", status: "todo", effort: "s" },
  ] as const satisfies ReadonlyArray<{ key: string; status: IssueStatus; effort: IssueEffort }>;
  return (
    <div className="w-full rounded-xl border border-border bg-background p-5 text-foreground shadow-sm" role="img" aria-label={t("feature_objectives_title")}>
      {/* Identity: color dot, name, and status. */}
      <div className="mb-4 flex items-center justify-between gap-2 border-b border-border pb-4">
        <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: "#10b981" }} aria-hidden />
          <span className="truncate">{t("objectiveFigureName")}</span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <ObjectiveStatusIndicator status="in_progress" className="size-3.5" />
          <span className="text-xs text-muted-foreground">{tObjectiveStatus("in_progress")}</span>
        </span>
      </div>
      {/* Indicators — progress · lead · target, as the real header clusters them:
          a circle followed by a muted label over a small value. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex items-center gap-2">
          <ProgressRing percent={55} colorClass="text-emerald-500" className="size-7" />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] text-muted-foreground">{tObjectives("progressLabel")}</span>
            <span className="text-xs font-medium tabular-nums">{tObjectives("completed", { done: 3, total: 8 })}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <UserAvatar seed={FIGURE_AVATARS.camille} className="size-7" />
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] text-muted-foreground">{tObjectives("leadFieldLabel")}</span>
            <span className="max-w-[9rem] truncate text-xs font-medium">{t("objectiveFigureLeadName")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
            <Target className="size-3.5" />
          </span>
          <div className="flex flex-col leading-tight">
            <span className="text-[11px] text-muted-foreground">{tObjectives("targetDatePlaceholder")}</span>
            <span className="text-xs font-medium">{t("objectiveFigureTargetDate")}</span>
          </div>
        </div>
      </div>
      {/* The attached issues that feed the ring, as slim board rows. */}
      <ul className="mt-4 space-y-3 border-t border-border pt-4">
        {issues.map(issue => (
          <li key={issue.key} className="flex items-center gap-3 text-sm">
            <span className="shrink-0"><StatusIndicator status={issue.status} /></span>
            <span className="min-w-0 flex-1 truncate">{t(issue.key)}</span>
            <EffortIndicator effort={issue.effort} className="shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}
