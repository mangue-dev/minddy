"use client";

import { useMemo, type ReactNode } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  File01Icon,
  GridIcon,
  SlidersHorizontalIcon,
  Tag01Icon,
  TextIcon,
  ArrowUp01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  CheckIcon,
  Copy01Icon,
  Message01Icon,
  Mic01Icon,
  Target01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";
import {
  COMMENT_FOLLOW_UP_CLASS,
  IssueCardCommentFollowUpContent,
  IssueCardFace,
} from "@/components/issue-card-face";
import { DictationWave } from "@/components/ai-elements/dictation-wave";
import { ImportSourceLogo } from "@/components/import-source-logo";
import { EffortIndicator, PriorityIndicator, RelationIcon, StatusIndicator } from "@/components/issue-indicators";
import { McpAgentLogo } from "@/components/mcp-agent-logo";
import { McpServiceLogo } from "@/components/mcp-service-logo";
import { ModelLogo } from "@/components/model-logo";
import { MentionChip } from "@/components/mention-chip";
import { ProjectOrb } from "@/components/project-orb";
import { SmartAssignAvatar, SmartFillAvatar } from "@/components/actor-avatars";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { PROSE } from "@/components/editor/prose";
import { displayName } from "@/lib/display-name";
import { MCP_AGENTS, type McpAgentId } from "@/lib/mcp-agents";
import { CARD_FADE, CARD_FADE_BOTTOM, CARD_FADE_LEFT, CARD_FADE_RIGHT, CARD_FADE_SIDES } from "../card-fade";
import {
  FIGURE_CATEGORIES,
  useFigureCategoryName,
  FIGURE_MEMBERS,
  FIGURE_PROJECT_KEY,
  figureIssue,
  useFigureMaps,
} from "./figure-world";
import { Caret, WRITERS } from "./pages-flow";

/**
 * The feature cards' illustrations that are built from the app's own pieces
 * rather than captured: each one is a still frame of the real surface, sized
 * to run past the card's edges into its fade.
 */

/** The orb seed of the demo world's Aurora project. */
const AURORA_ORB = "bdd736ea-c04b-49f0-9217-6965c2339364";

/** A surface of the app (a panel, a popover) cut by the card's edges. */
function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE)}>
      <div
        className={cn(
          "h-full w-[150%] rounded-tl-xl border-t border-l border-border bg-background p-4 text-sm",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Smart Assign as the issue's activity says it, under the issue's creation and Smart Fill. */
export function SmartAssignActivity() {
  const t = useTranslations("Activity");
  const rows: { avatar: ReactNode; name: string; text: string }[] = [
    {
      avatar: <UserAvatar seed={FIGURE_MEMBERS.tom.avatar_seed} className="size-5 shrink-0" />,
      name: FIGURE_MEMBERS.tom.full_name ?? "",
      text: t("created"),
    },
    { avatar: <SmartFillAvatar />, name: "Smart Fill", text: t("smartFilled", { fields: t("smartFillProperties") }) },
    {
      avatar: <SmartAssignAvatar />,
      name: "Smart Assign",
      text: t("smartAssignedByRules", { to: FIGURE_MEMBERS.camille.full_name ?? "" }),
    },
  ];
  return (
    <Surface>
      <ul className="flex flex-col gap-3.5">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-2.5 whitespace-nowrap">
            {row.avatar}
            <span className="font-medium text-foreground">{row.name}</span>
            <span className="text-muted-foreground">{row.text}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/**
 * Numo's composer, compact as in the app (`chat-input.tsx`): one rounded
 * pill with the add button, the text, the microphone and send, on the app's
 * background like the other surfaces of the cards. Enlarged, with a question
 * typed and not sent, running off to the right.
 */
export function NumoComposer({ prompt = "cardNumo_question" }: { prompt?: "cardNumo_question" | "cardNumo_page" }) {
  const t = useTranslations("Landing");
  return (
    <div aria-hidden className={cn("flex h-full w-full items-center pb-6 select-none", CARD_FADE)}>
      <div className="flex w-[160%] shrink-0 items-center gap-3 rounded-[2rem] bg-background p-3 shadow-sm">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground">
          <HugeiconsIcon icon={Add01Icon} className="size-5" />
        </span>
        <p className="min-w-0 flex-1 truncate text-lg">
          {t(prompt)}
          <span className="ml-0.5 inline-block h-5 w-px translate-y-1 bg-foreground" />
        </p>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground">
          <HugeiconsIcon icon={Mic01Icon} className="size-5" />
        </span>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <HugeiconsIcon icon={ArrowUp02Icon} className="size-5" />
        </span>
      </div>
    </div>
  );
}

/** A routine as its preview card shows it: name, schedule, then its instructions. */
export function RoutineExcerpt() {
  const t = useTranslations("Landing");
  return (
    <Surface>
      <p className="font-medium">{t("cardRoutine_name")}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t("cardRoutine_schedule")}</p>
      <p className="mt-3 w-[22rem] leading-relaxed text-muted-foreground">{t("cardRoutine_body")}</p>
    </Surface>
  );
}

/**
 * The dictation pill while you speak (`dictation-pill.tsx`), held still and
 * enlarged: its colored wave, the timer, and the validate button on the
 * right; the discard button fades out on the left.
 */
export function DictationPill() {
  return (
    <div aria-hidden className={cn("relative h-full w-full select-none", CARD_FADE_LEFT)}>
      <div className="absolute top-6 right-6 flex w-[30rem] items-center gap-3 rounded-full bg-popover p-3 text-popover-foreground shadow-lg ring-1 ring-border">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full border border-border">
          <HugeiconsIcon icon={Cancel01Icon} className="size-5" />
        </span>
        <div className="flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1">
          <DictationWave stream={null} busy still className="h-[40px]" />
          <span className="text-xs leading-none font-medium tabular-nums text-muted-foreground">0:07</span>
        </div>
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.25} className="size-7" />
        </span>
      </div>
    </div>
  );
}

/** Logos and names in two columns filling the card: the agents, the apps or the tools you come from. */
function LogoGrid({ items }: { items: { key: string; logo: ReactNode; name: string }[] }) {
  return (
    <ul aria-hidden className={cn("grid h-full grid-cols-2 content-start gap-x-4 gap-y-3 pt-1 pr-2 select-none", CARD_FADE)}>
      {items.map((item) => (
        <li key={item.key} className="flex min-w-0 items-center gap-2.5 text-[15px] font-medium tracking-tight">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background shadow-xs">
            {item.logo}
          </span>
          <span className="truncate">{item.name}</span>
        </li>
      ))}
    </ul>
  );
}

const AGENT_IDS: McpAgentId[] = ["claude", "codex", "opencode", "cursor", "gemini", "windsurf", "vscode", "claude-desktop"];

export function McpAgents() {
  const agents = AGENT_IDS.map((id) => MCP_AGENTS.find((agent) => agent.id === id)!);
  return (
    <LogoGrid
      items={agents.map((agent) => ({ key: agent.id, logo: <McpAgentLogo agent={agent.id} size={18} />, name: agent.label }))}
    />
  );
}

const APPS = [
  { id: "posthog", name: "PostHog" },
  { id: "notion", name: "Notion" },
  { id: "supabase", name: "Supabase" },
  { id: "vercel", name: "Vercel" },
  { id: "linear", name: "Linear" },
  { id: "github", name: "GitHub" },
  { id: "sentry", name: "Sentry" },
  { id: "slack", name: "Slack" },
] as const;

export function McpApps() {
  return (
    <LogoGrid
      items={APPS.map((app) => ({ key: app.id, logo: <McpServiceLogo service={app.id} className="size-[18px]" />, name: app.name }))}
    />
  );
}

/** Where an import comes from, in the order people move from. */
const IMPORT_SOURCES = [
  { id: "linear", name: "Linear" },
  { id: "github", name: "GitHub" },
  { id: "notion", name: "Notion" },
  { id: "jira", name: "Jira" },
  { id: "trello", name: "Trello" },
  { id: "minddy", name: "minddy" },
] as const;

export function ImportSources() {
  return (
    <LogoGrid
      items={IMPORT_SOURCES.map((source) => ({
        key: source.id,
        logo: <ImportSourceLogo source={source.id} size={18} />,
        name: source.name,
      }))}
    />
  );
}

/** The providers whose models Numo can run, by the provider's logo. */
const PROVIDERS = [
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "google", name: "Google" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "mistral", name: "Mistral" },
  { id: "xai", name: "xAI" },
  { id: "qwen", name: "Qwen" },
  { id: "moonshot", name: "Moonshot" },
] as const;

export function AiModels() {
  return (
    <LogoGrid
      items={PROVIDERS.map((provider) => ({
        key: provider.id,
        logo: <ModelLogo model={`${provider.id}/model`} size={18} />,
        name: provider.name,
      }))}
    />
  );
}

/** An issue card enlarged and centered on its top right corner, fading on the left. */
function CardCorner({ children }: { children: ReactNode }) {
  return (
    <div aria-hidden className={cn("relative h-full w-full overflow-hidden select-none", CARD_FADE_LEFT)}>
      {/* The board's card surface: the card itself is transparent on its column. */}
      <div className="absolute top-2 right-[36%] w-[300px] origin-top-right scale-[1.45] rounded-2xl bg-background [&_*]:pointer-events-none">
        {children}
      </div>
    </div>
  );
}

/** The pull request chip next to the assignee, as the board shows it while the review runs. */
export function IssuePullRequest() {
  const t = useTranslations("Landing");
  const { memberMap, categoryMap } = useFigureMaps();
  const issue = useMemo(
    () =>
      figureIssue({
        number: 42,
        title: t("cardReview_title"),
        status: "in_review",
        priority: "high",
        effort: "s",
        category_ids: [FIGURE_CATEGORIES.bug.id],
        assignee_id: FIGURE_MEMBERS.tom.user_id,
      }),
    [t],
  );
  return (
    <CardCorner>
      <IssueCardFace
        issue={issue}
        projectKey={FIGURE_PROJECT_KEY}
        memberMap={memberMap}
        categoryMap={categoryMap}
        pr={{ prId: "card-pr", prNumber: 128, state: "open" }}
      />
    </CardCorner>
  );
}

/** The card of an issue with comments the agent has not answered yet: the chip that copies them as a prompt. */
export function IssueCommentFollowUp() {
  const t = useTranslations("Landing");
  const { memberMap, categoryMap } = useFigureMaps();
  const issue = useMemo(
    () =>
      figureIssue({
        number: 37,
        title: t("cardComments_title"),
        status: "in_progress",
        priority: "medium",
        effort: "xs",
        category_ids: [FIGURE_CATEGORIES.improvement.id],
        assignee_id: FIGURE_MEMBERS.alice.user_id,
      }),
    [t],
  );
  return (
    <CardCorner>
      <IssueCardFace
        issue={issue}
        projectKey={FIGURE_PROJECT_KEY}
        memberMap={memberMap}
        categoryMap={categoryMap}
        commentFollowUp={{ count: 2, since: "", threads: [] }}
        slots={{
          commentFollowUp: (
            <span className={COMMENT_FOLLOW_UP_CLASS}>
              <IssueCardCommentFollowUpContent count={2} />
            </span>
          ),
        }}
      />
    </CardCorner>
  );
}

const DELIVERIES = [
  { event: "issue.created", ref: "AUR-48", ms: 182 },
  { event: "issue.assigned", ref: "AUR-48", ms: 96 },
  { event: "issue.status_changed", ref: "AUR-42", ms: 121 },
  { event: "issue.comment_added", ref: "AUR-42", ms: 88 },
  { event: "issue.updated", ref: "AUR-39", ms: 104 },
  { event: "issue.status_changed", ref: "AUR-39", ms: 97 },
  { event: "issue.created", ref: "AUR-49", ms: 143 },
  { event: "issue.comment_added", ref: "AUR-37", ms: 91 },
  { event: "issue.assigned", ref: "AUR-49", ms: 110 },
  { event: "issue.updated", ref: "AUR-42", ms: 86 },
  { event: "issue.created", ref: "AUR-50", ms: 158 },
  { event: "issue.status_changed", ref: "AUR-48", ms: 99 },
] as const;

/** Webhook deliveries as a log that goes on past the card. Event names are the API's. */
export function WebhookLog() {
  return (
    <Surface className="font-mono text-xs leading-6">
      {DELIVERIES.map((line, index) => (
        <div key={index} className="flex gap-3 whitespace-nowrap">
          <span className="text-muted-foreground">POST</span>
          <span className="text-emerald-600 dark:text-emerald-400">200</span>
          <span className="w-44">{line.event}</span>
          <span className="text-muted-foreground">{line.ref}</span>
          <span className="text-muted-foreground">{line.ms} ms</span>
        </div>
      ))}
    </Surface>
  );
}

/** A few lines of the scratchpad: a heading and its tasks, some already done. */
export function NotebookExcerpt() {
  const t = useTranslations("Landing");
  const items = [
    { key: "cardNotebook_item1", done: true },
    { key: "cardNotebook_item2", done: true },
    { key: "cardNotebook_item3", done: false },
    { key: "cardNotebook_item4", done: false },
  ] as const;
  return (
    <Surface>
      <p className="text-base font-semibold">{t("cardNotebook_title")}</p>
      <ul className="mt-2.5 flex flex-col gap-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2.5 whitespace-nowrap">
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                item.done ? "border-foreground bg-foreground text-background" : "border-foreground/30",
              )}
            >
              {item.done && <HugeiconsIcon icon={Tick02Icon} className="size-3" strokeWidth={2.5} />}
            </span>
            <span className={item.done ? "text-muted-foreground line-through" : undefined}>{t(item.key)}</span>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

/** Projects as a small team would name them, translated, each with its own orb. */
const PROJECTS = [
  { key: "cardProjects_website", seed: AURORA_ORB },
  { key: "cardProjects_mobile", seed: "4f1c2b7e-9a63-4d1e-8c55-2f7b0e9d6a11" },
  { key: "cardProjects_api", seed: "acme-api-orb" },
  { key: "cardProjects_design", seed: "design-system-orb" },
  { key: "cardProjects_docs", seed: "help-center-orb" },
  { key: "cardProjects_billing", seed: "billing-orb" },
  { key: "cardProjects_marketing", seed: "launch-orb" },
  { key: "cardProjects_internal", seed: "internal-tools-orb" },
] as const;

/** The sidebar's project list, enlarged: every project in one column. */
export function ProjectSidebar() {
  const t = useTranslations("Landing");
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE_BOTTOM)}>
      <div className="w-full max-w-sm rounded-t-2xl bg-sidebar p-3 text-[15px] text-sidebar-foreground shadow-sm">
        <ul className="flex flex-col">
          {PROJECTS.map((project) => (
            <li key={project.key} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
              <ProjectOrb seed={project.seed} className="size-5 rounded-[5px]" />
              {t(project.key)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The board's view tabs, enlarged: the default view, mine, a saved one, the cycle. */
export function ViewTabs() {
  const tb = useTranslations("Board");
  const t = useTranslations("Landing");
  return (
    <div aria-hidden className={cn("flex h-full w-full flex-col gap-4 pt-1 select-none", CARD_FADE)}>
      <div className="flex w-[180%] items-center gap-2 text-lg">
        <span className="rounded-full bg-foreground px-4 py-1.5 font-medium text-background">{tb("defaultViewName")}</span>
        <span className="flex items-center gap-2 rounded-full px-3 py-1.5">
          <UserAvatar seed={FIGURE_MEMBERS.camille.avatar_seed} className="size-5" />
          {tb("myView")}
        </span>
        <span className="flex items-center gap-2 rounded-full px-3 py-1.5">
          <span className="size-2.5 rounded-full bg-red-500" />
          {t("cardViews_bugs")}
        </span>
        <span className="flex items-center gap-2 rounded-full px-3 py-1.5">
          <StatusIndicator status="in_progress" className="size-4" />
          {tb("cycleTab")}
        </span>
      </div>
      <div className="flex w-[160%] flex-col gap-2">
        {[0, 1].map((row) => (
          <div key={row} className="h-14 rounded-xl border border-border bg-background" />
        ))}
      </div>
    </div>
  );
}

/** Created and completed issues, counted week after week: two lines of points climbing steadily. */
const WEEKS = [
  [22, 12],
  [38, 30],
  [61, 47],
  [79, 70],
  [98, 84],
  [121, 104],
  [140, 126],
  [158, 141],
  [181, 162],
  [199, 177],
  [214, 189],
] as const;

export function StatsChart() {
  const t = useTranslations("Landing");
  const width = 420;
  const height = 120;
  const max = 214;
  const x = (index: number) => (index / (WEEKS.length - 1)) * width;
  const y = (value: number) => height - (value / max) * (height - 8) - 4;
  const series = [
    { label: t("cardStats_created"), total: 214, at: 0, line: "stroke-foreground/30", dot: "fill-foreground/40" },
    { label: t("cardStats_completed"), total: 189, at: 1, line: "stroke-emerald-500", dot: "fill-emerald-500" },
  ] as const;
  return (
    <div aria-hidden className={cn("h-full w-full pr-2 select-none", CARD_FADE_RIGHT)}>
      <div className="flex w-[150%] gap-8 text-sm">
        {series.map((item) => (
          <div key={item.label}>
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <svg viewBox="0 0 8 8" className="size-2">
                <circle cx="4" cy="4" r="4" className={item.dot} />
              </svg>
              {item.label}
            </p>
            <p className="text-2xl font-semibold tabular-nums">{item.total}</p>
          </div>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-28 w-full overflow-visible" preserveAspectRatio="none">
        {series.map((item) => (
          <g key={item.label}>
            <polyline
              points={WEEKS.map((week, index) => `${x(index)},${y(week[item.at])}`).join(" ")}
              fill="none"
              strokeWidth={2}
              strokeLinejoin="round"
              className={item.line}
              vectorEffect="non-scaling-stroke"
            />
            {WEEKS.map((week, index) => (
              <circle key={index} cx={x(index)} cy={y(week[item.at])} r={3} className={item.dot} />
            ))}
          </g>
        ))}
      </svg>
    </div>
  );
}

/** Two teammates writing in the same lines at once, held still: carets and name tags. */
export function LiveEditing() {
  const t = useTranslations("Landing");
  return (
    <Surface className="pt-6 pl-5">
      <div className={cn(PROSE.page, "w-[26rem]")}>
        <ul>
          <li>{t("pagesFigure_line1")}</li>
          <li>
            {t("pagesFigure_line2").slice(0, 22)}
            <Caret userId={WRITERS[0].user_id} name={displayName(WRITERS[0])} />
          </li>
          <li>
            {t("pagesFigure_line3").slice(0, 16)}
            <Caret userId={WRITERS[1].user_id} name={displayName(WRITERS[1])} />
          </li>
        </ul>
      </div>
    </Surface>
  );
}

/** A property as Smart Fill sets it: the app's own indicator on a white pill. */
function PropertyPill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-background px-3 text-sm">
      {children}
    </span>
  );
}

/** Every property Smart Fill sets, in offset rows running past both sides of the card. */
export function SmartFillProperties() {
  const t = useTranslations("Landing");
  const tPriority = useTranslations("Priority");
  const tRelations = useTranslations("Relations");
  const categoryName = useFigureCategoryName();
  const priority = (value: "urgent" | "high" | "medium" | "low") => (
    <PropertyPill>
      <PriorityIndicator priority={value} />
      {tPriority(value)}
    </PropertyPill>
  );
  const effort = (value: "xs" | "s" | "m" | "l" | "xl") => (
    <PropertyPill>
      <EffortIndicator effort={value} />
    </PropertyPill>
  );
  const category = (key: keyof typeof FIGURE_CATEGORIES) => (
    <PropertyPill>
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: FIGURE_CATEGORIES[key].color }} />
      {categoryName(key)}
    </PropertyPill>
  );
  const objective = (name: string, color: string) => (
    <PropertyPill>
      <HugeiconsIcon icon={Target01Icon} className="size-4 shrink-0" style={{ color }} />
      {name}
    </PropertyPill>
  );
  const relation = (kind: "blocks" | "blocked_by" | "related", number: number) => (
    <PropertyPill>
      <RelationIcon relation={kind} />
      {tRelations(kind)}
      <span className="font-mono text-xs text-muted-foreground">AUR-{number}</span>
    </PropertyPill>
  );
  const rows: ReactNode[][] = [
    [priority("high"), category("bug"), effort("s"), relation("blocks", 12), objective(t("cardMentions_objective"), "#3b82f6")],
    [category("feature"), priority("urgent"), objective(t("pagesFigure_title"), "#8b5cf6"), effort("m"), category("design")],
    [effort("xs"), category("improvement"), relation("related", 38), priority("medium"), category("documentation")],
    [priority("low"), category("technical"), effort("l"), relation("blocked_by", 41), priority("high")],
    [category("bug"), effort("xl"), objective(t("cardMentions_objective"), "#3b82f6"), priority("urgent"), effort("s")],
  ];
  // Each row starts at its own offset, past the left edge, as on the mentions card.
  const offsets = ["-ml-16", "-ml-28", "-ml-6", "-ml-20", "-ml-10"];
  return (
    <div aria-hidden className={cn("-ml-8 h-full w-[calc(100%+2rem)] select-none", CARD_FADE_SIDES)}>
      <div className="flex h-full flex-col gap-2.5 overflow-hidden py-1 [&_*]:pointer-events-none">
        {rows.map((row, index) => (
          <div key={index} className={cn("flex gap-2", offsets[index])}>
            {row.map((pill, pillIndex) => (
              <span key={pillIndex} className="contents">
                {pill}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Every kind of mention, in rows that start past the left edge and run past the right one. */
export function MentionBento() {
  const t = useTranslations("Landing");
  const format = useFormatter();
  const camille = FIGURE_MEMBERS.camille;
  const tom = FIGURE_MEMBERS.tom;
  const alice = FIGURE_MEMBERS.alice;
  const date = (day: number) => format.dateTime(new Date(2026, 10, day), { day: "numeric", month: "long" });
  const rows: ReactNode[][] = [
    [
      <MentionChip key="a" type="issue" id="figure-41" label={`AUR-41 ${t("heroFlow_still_onboarding")}`} status="todo" />,
      <MentionChip key="b" type="member" id="camille" label={camille.full_name ?? ""} avatarSeed={camille.avatar_seed} />,
      <MentionChip key="c" type="page" id="figure-page" label={t("pagesFigure_title")} icon="🚀" />,
      <MentionChip key="d" type="pull_request" id="figure-pr" label="#128" prState="open" />,
    ],
    [
      <MentionChip key="a" type="date" id="date" label={date(14)} />,
      <MentionChip key="b" type="issue" id="figure-42" label={`AUR-42 ${t("heroFlow_issueTitle")}`} status="in_review" />,
      <MentionChip key="c" type="numo" id="numo" label="Numo" />,
      <MentionChip key="d" type="project" id="aurora" label="Aurora" avatarSeed={AURORA_ORB} />,
    ],
    [
      <MentionChip key="a" type="mcp" id="posthog" label="PostHog" mcpService="posthog" />,
      <MentionChip key="b" type="objective" id="figure-objective" label={t("cardMentions_objective")} color="#3b82f6" />,
      <MentionChip key="c" type="member" id="tom" label={tom.full_name ?? ""} avatarSeed={tom.avatar_seed} />,
      <MentionChip key="d" type="routine" id="routine" label={t("cardRoutine_name")} />,
    ],
    [
      <MentionChip key="a" type="member" id="alice" label={alice.full_name ?? ""} avatarSeed={alice.avatar_seed} />,
      <MentionChip key="b" type="issue" id="figure-43" label={`AUR-43 ${t("aiFigure_issue1")}`} status="todo" />,
      <MentionChip key="c" type="date" id="date2" label={date(20)} />,
      <MentionChip key="d" type="mcp" id="supabase" label="Supabase" mcpService="supabase" />,
    ],
    [
      <MentionChip key="a" type="page" id="figure-page2" label={t("cardWiki_design")} icon="🎨" />,
      <MentionChip key="b" type="issue" id="figure-38" label={`AUR-38 ${t("heroFlow_still_search")}`} status="in_progress" />,
      <MentionChip key="c" type="pull_request" id="figure-pr2" label="#121" prState="merged" />,
      <MentionChip key="d" type="numo" id="numo2" label="Numo" />,
    ],
  ];
  // Each row starts at its own offset, past the left edge, so the board reads as wider than the card.
  const offsets = ["-ml-16", "-ml-28", "-ml-6", "-ml-20", "-ml-10"];
  return (
    <div aria-hidden className={cn("-ml-8 h-full w-[calc(100%+2rem)] select-none", CARD_FADE_SIDES)}>
      <div className="h-full overflow-hidden py-1 text-[15px] [&_*]:pointer-events-none">
        {rows.map((row, index) => (
          // Inline, as in the editor: a chip's figure is aligned on the text's baseline.
          <p key={index} className={cn("leading-10 whitespace-nowrap", offsets[index])}>
            {row.map((chip, chipIndex) => (
              <span key={chipIndex}>
                {chip}{" "}
              </span>
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

const DB_PEOPLE = [
  { name: "Maya Chen", email: "maya@example.com", age: 31, role: "admin", skills: ["javascript", "python"], emoji: "🙂" },
  { name: "Lucas Brandt", email: "lucas@example.com", age: 26, role: "member", skills: ["design", "javascript"], emoji: null },
  { name: "Sofia Rossi", email: "sofia@example.com", age: 28, role: "member", skills: ["devops"], emoji: null },
  { name: "Noah Petit", email: "noah@example.com", age: 45, role: "guest", skills: ["python"], emoji: null },
  { name: "Emma Moreau", email: "emma@example.com", age: 35, role: "admin", skills: ["javascript", "design", "devops"], emoji: null },
] as const;

/** Select option colors, as the database paints them in both themes. */
const DB_PILL = {
  admin: "bg-red-500/12 text-red-700 dark:text-red-300",
  member: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  guest: "bg-foreground/8 text-muted-foreground",
  python: "bg-green-500/12 text-green-700 dark:text-green-300",
  design: "bg-purple-500/12 text-purple-700 dark:text-purple-300",
  javascript: "bg-amber-400/20 text-amber-700 dark:text-amber-300",
  devops: "bg-orange-500/12 text-orange-700 dark:text-orange-300",
} as const;

const SKILL_NAMES = { python: "Python", design: "Design", javascript: "JavaScript", devops: "DevOps" } as const;

/** A database in a page: its views, typed columns and select pills, rows past the card. */
export function DatabaseRows() {
  const t = useTranslations("Landing");
  const head = "flex h-10 items-center gap-2 border-b border-border px-3 font-normal text-muted-foreground";
  const cell = "flex h-11 items-center gap-2 border-r border-b border-border px-3 whitespace-nowrap";
  const pill = (key: keyof typeof DB_PILL, label: string) => (
    <span className={cn("rounded-md px-1.5 py-0.5 text-[12.5px] font-medium", DB_PILL[key])}>{label}</span>
  );
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE)}>
      <div className="w-[46rem] rounded-tl-xl bg-background p-3 text-[13.5px]">
        <div className="mb-2 flex items-center gap-1">
          <span className="rounded-full bg-foreground px-3 py-1 font-medium text-background">{t("cardDb_viewTeam")}</span>
          <span className="px-3 py-1 text-muted-foreground">Python</span>
          <span className="px-3 py-1 text-muted-foreground">{t("cardDb_role_admin")}</span>
          <HugeiconsIcon icon={Add01Icon} className="ml-1 size-4 text-muted-foreground" />
        </div>
        {/* The select columns first: their pills are what a database looks like at a glance. */}
        <div className="grid grid-cols-[10.5rem_7rem_12rem_12rem_5rem]">
          <div className={head}>{t("cardDb_name")}</div>
          <div className={head}>
            <HugeiconsIcon icon={SlidersHorizontalIcon} className="size-3.5" />
            {t("cardDb_role")}
          </div>
          <div className={head}>
            <HugeiconsIcon icon={Tag01Icon} className="size-3.5" />
            {t("cardDb_skills")}
          </div>
          <div className={head}>
            <HugeiconsIcon icon={TextIcon} className="size-3.5" />
            {t("cardDb_email")}
          </div>
          <div className={head}>
            <HugeiconsIcon icon={GridIcon} className="size-3.5" />
            {t("cardDb_age")}
          </div>
          {DB_PEOPLE.map((person) => (
            <div key={person.email} className="contents">
              <div className={cn(cell, "font-medium")}>
                {person.emoji ? (
                  <span className="text-[15px] leading-none">{person.emoji}</span>
                ) : (
                  <HugeiconsIcon icon={File01Icon} className="size-4 text-muted-foreground" />
                )}
                {person.name}
              </div>
              <div className={cell}>{pill(person.role, t(`cardDb_role_${person.role}`))}</div>
              <div className={cell}>
                {person.skills.map((skill) => (
                  <span key={skill}>{pill(skill, SKILL_NAMES[skill])}</span>
                ))}
              </div>
              <div className={cell}>{person.email}</div>
              <div className={cn(cell, "border-r-0 tabular-nums")}>{person.age}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The page's versions panel: who saved which version, and when, with Restore. */
export function VersionHistory() {
  const t = useTranslations("Pages");
  const tl = useTranslations("Landing");
  const format = useFormatter();
  const now = new Date(2026, 10, 2, 12, 0);
  const versions = [
    { member: FIGURE_MEMBERS.alice, minutes: 7, open: true },
    { member: FIGURE_MEMBERS.tom, minutes: 42, open: false },
    { member: FIGURE_MEMBERS.camille, minutes: 180, open: false },
    { member: FIGURE_MEMBERS.alice, minutes: 1440, open: false },
  ];
  return (
    <Surface>
      <p className="mb-3 text-xs font-medium text-muted-foreground">{t("historyTabVersions")}</p>
      <ul className="flex w-[22rem] flex-col gap-2">
        {versions.map((version, index) => (
          <li key={index} className={cn("rounded-xl border border-border px-3 py-2.5", version.open && "bg-muted/50")}>
            <div className="flex items-center gap-2 text-xs">
              <UserAvatar seed={version.member.avatar_seed} className="size-5" />
              <span className="font-medium">{version.member.full_name}</span>
              <span className="text-muted-foreground">
                · {format.relativeTime(new Date(now.getTime() - version.minutes * 60_000), now)}
              </span>
            </div>
            {version.open && (
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm font-medium">{tl("pagesFigure_title")}</span>
                <span className="rounded-md border border-border bg-background px-2 py-1 text-xs">
                  {t("historyRestore")}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Surface>
  );
}

const FEEDBACK = [
  { title: "cardFeedback_post1", body: "cardFeedback_post1Body", status: "planned", votes: 24, seed: "maya", comments: 0 },
  { title: "cardFeedback_post2", body: "cardFeedback_post2Body", status: "in_progress", votes: 18, seed: "tom", comments: 1 },
  { title: "cardFeedback_post3", body: "cardFeedback_post3Body", status: "open", votes: 9, seed: "alice", comments: 0 },
] as const;

/** The status icon a feedback request borrows from the issue it becomes. */
const FEEDBACK_STATUS_ICON = { open: "backlog", planned: "todo", in_progress: "in_progress" } as const;

/** The public feedback board's rows (`app/f/[token]/feedback-bits.tsx`), enlarged. */
export function FeedbackRows() {
  const t = useTranslations("Landing");
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE)}>
      <ul className="flex w-[30rem] flex-col gap-1 rounded-tl-xl bg-background p-2">
        {FEEDBACK.map((post) => (
          <li key={post.title} className="flex items-start gap-4 rounded-lg px-3 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[15px] leading-snug font-semibold">{t(post.title)}</p>
              <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{t(post.body)}</p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                <UserAvatar seed={post.seed} className="size-7" />
                <Badge
                  variant="secondary"
                  icon={<StatusIndicator status={FEEDBACK_STATUS_ICON[post.status]} />}
                  className={
                    post.status === "in_progress"
                      ? "bg-amber-500/10 text-amber-700 dark:bg-yellow-300/10 dark:text-yellow-300"
                      : "text-muted-foreground"
                  }
                >
                  {t(`cardFeedback_status_${post.status}`)}
                </Badge>
                {post.comments > 0 && (
                  <span className="flex items-center gap-1">
                    <HugeiconsIcon icon={Message01Icon} className="size-3.5" />
                    {post.comments}
                  </span>
                )}
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full border bg-control px-3 py-1.5 text-sm font-semibold tabular-nums">
              <HugeiconsIcon icon={ArrowUp01Icon} className="size-4" />
              {post.votes}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The top right of a triaged issue (`triage-page.tsx`), with the app's own buttons, enlarged. */
export function TriageActions() {
  const t = useTranslations("Landing");
  return (
    <div aria-hidden className={cn("relative h-full w-full select-none", CARD_FADE_LEFT)}>
      <div className="absolute top-5 right-6 flex origin-top-right scale-[1.35] items-center gap-1.5 rounded-2xl bg-background p-3 shadow-sm [&_*]:pointer-events-none">
        <Button variant="outline" size="sm" tabIndex={-1}>
          <HugeiconsIcon icon={Copy01Icon} className="text-muted-foreground" />
          {t("cardTriage_duplicate")}
        </Button>
        <Button variant="destructive" size="sm" tabIndex={-1}>
          <HugeiconsIcon icon={Cancel01Icon} />
          {t("cardTriage_decline")}
        </Button>
        <Button size="sm" tabIndex={-1}>
          <HugeiconsIcon icon={CheckIcon} />
          {t("cardTriage_accept")}
        </Button>
      </div>
    </div>
  );
}

/** A project's wiki in the sidebar: nested pages with their emoji, one of them open. */
export function WikiTree() {
  const t = useTranslations("Landing");
  const pages = [
    { key: "cardWiki_handbook", emoji: "📘", depth: 0, open: false },
    { key: "cardWiki_release", emoji: "🚀", depth: 1, open: true },
    { key: "cardWiki_design", emoji: "🎨", depth: 1, open: false },
    { key: "cardWiki_support", emoji: "🛟", depth: 1, open: false },
    { key: "cardWiki_launch", emoji: "🧭", depth: 0, open: false },
    { key: "cardWiki_meetings", emoji: "🗒️", depth: 0, open: false },
    { key: "cardWiki_metrics", emoji: "📊", depth: 0, open: false },
  ] as const;
  return (
    <div aria-hidden className={cn("h-full w-full select-none", CARD_FADE_BOTTOM)}>
      <ul className="w-[19rem] rounded-t-xl bg-background p-2 text-[15px]">
        {pages.map((page) => (
          <li
            key={page.key}
            className={cn(
              "flex items-center gap-2.5 rounded-lg py-2 pr-3",
              page.depth ? "pl-9" : "pl-3",
              page.open && "bg-muted font-medium",
            )}
          >
            <span className="w-5 text-center text-[15px] leading-none">{page.emoji}</span>
            {t(page.key)}
          </li>
        ))}
      </ul>
    </div>
  );
}
