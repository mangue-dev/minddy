"use client";

import { type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { Book02Icon, DatabaseIcon, File02Icon, GitBranchIcon, Layers01Icon } from "@hugeicons/core-free-icons";
import { Checkbox } from "@/components/ui/checkbox";
import { AppIcon } from "@/components/icon";
import { OptionBadge } from "@/components/pages/database-select-cell";
import { PROPERTY_ICONS } from "@/components/pages/database-property-icons";
import type { DatabasePropertyType } from "@/lib/page-databases";
import { cn } from "@/lib/utils";
import { IssueCardBody } from "@/components/issue-card";
import { ObjectiveStatusIndicator } from "@/components/issue-indicators";
import { OBJECTIVE_TEXT, objectiveTextStyle } from "@/components/objective-label";
import { ObjectiveProgressStat } from "@/components/objective-progress";
import { ProjectOrb } from "@/components/project-orb";
import { RelationChips } from "@/components/relation-chips";
import { UserAvatar } from "@/components/user-avatar";
import { LazyDocumentEditor } from "@/components/editor/document-editor-lazy";
import { PULL_REQUEST_ICON, ROUTINE_ICON, SCRATCHPAD_ICON, CYCLE_ICON } from "@/components/feature-icons";
import { McpServiceLogo } from "@/components/mcp-service-logo";
import { ROUTINE_STATE_ICONS, ROUTINE_STATE_STYLES } from "@/components/routines/routine-detail-sections";
import { Badge } from "@/components/ui/badge";
import type { ProjectRole } from "@/lib/project-roles";
import { displayName } from "@/lib/display-name";
import type { MentionPreview, PreviewProject } from "@/lib/mention-preview";
import { workProgress } from "@/lib/use-objectives-query";
import type { IssueCardCategory, IssueCardObjective, Member, Project } from "@/lib/types";

/**
 * The bodies of the mention hover cards (MIN-879), one per target type. They
 * pull in the issue card, the read-only document editor, database cells and
 * routine badges: components/mention-hover-card.tsx loads this module only
 * when a card is about to open, so no route pays for it upfront.
 */

/** The body of a card, for a preview already in hand. */
export function MentionPreviewCard({ preview }: { preview: MentionPreview }) {
  switch (preview.type) {
    case "issue": return <IssuePreviewCard preview={preview} />;
    case "objective": return <ObjectivePreviewCard preview={preview} />;
    case "page": return <PagePreviewCard preview={preview} />;
    case "project": return <ProjectPreviewCard preview={preview} />;
    case "member": return <MemberPreviewCard preview={preview} />;
    case "routine": return <RoutinePreviewCard preview={preview} />;
    case "scratchpad": return <ScratchpadPreviewCard preview={preview} />;
    case "cycle": return <CyclePreviewCard preview={preview} />;
    case "pull_request": return <PullRequestPreviewCard preview={preview} />;
    case "mcp": return <McpPreviewCard preview={preview} />;
    case "skill": return <SkillPreviewCard preview={preview} />;
  }
}

/* ── Shared pieces ──────────────────────────────────────────────────────── */

/** A card's head line: its figure, its name, and what sits at its right. */
function Head({ figure, title, aside, style, titleClassName }: {
  figure: ReactNode;
  title: ReactNode;
  aside?: ReactNode;
  style?: React.CSSProperties;
  titleClassName?: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2" style={style}>
      <span className="flex size-4 shrink-0 items-center justify-center">{figure}</span>
      <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", titleClassName)}>{title}</span>
      {aside}
    </div>
  );
}

/** Small grey facts under a head line, separated by dots. */
function Facts({ children }: { children: ReactNode[] }) {
  const items = children.filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
      {items.map((item, index) => (
        <span key={index} className="flex min-w-0 items-center gap-1.5">
          {index > 0 && <span aria-hidden>·</span>}
          {item}
        </span>
      ))}
    </div>
  );
}

/** The project a target belongs to, at the top left, as on an issue card. */
function ProjectLine({ project }: { project: PreviewProject }) {
  return (
    <div className="flex h-5 min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
      {/* A rounded square, as the project's pill draws it: 5px would round
          a 14px icon into a disc. */}
      <ProjectOrb seed={project.orbSeed} iconUrl={project.iconUrl} className="size-3.5 shrink-0 rounded-[3px]" />
      <span className="truncate">{project.name}</span>
    </div>
  );
}

/** A small colored badge at the right of a head line: a state or a role. */
function StateBadge({ className, icon, children }: { className: string; icon?: IconSvgElement; children: ReactNode }) {
  return (
    <Badge
      variant="secondary"
      icon={icon ? <HugeiconsIcon icon={icon} /> : undefined}
      className={cn("h-5 shrink-0 px-1.5 text-[11px] [&>svg]:size-3", className)}
    >
      {children}
    </Badge>
  );
}

const ROLE_STYLES: Record<ProjectRole, string> = {
  owner: "bg-violet-500/10 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
  member: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
  reader: "bg-slate-500/10 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300",
};

/** A person's role in a project, colored by role. */
function RoleBadge({ role }: { role: ProjectRole }) {
  const t = useTranslations("Members");
  return (
    <StateBadge className={ROLE_STYLES[role]}>
      {role === "owner" ? t("owner") : role === "reader" ? t("roleReader") : t("roleMember")}
    </StateBadge>
  );
}

/**
 * What does not fit a card fades out to the right and at the bottom, past
 * an inner surface wider than the card: a database's table, a text's lines.
 */
const FADE_RIGHT_AND_BOTTOM = cn(
  "[mask-image:linear-gradient(to_right,black_70%,transparent),linear-gradient(to_bottom,black_55%,transparent)]",
  "[mask-composite:intersect] [-webkit-mask-composite:source-in]",
);

/**
 * A card's content sits behind its title: the whole render is dimmed, every
 * heading, line, pill and cell alike, so the title reads first and the
 * content's own hierarchy stays as it is.
 */
const CONTENT_DIM = "opacity-60";

/**
 * The first lines of a text, as a database's first rows: starting under the
 * card's title (pl-9: 12px of card padding and 24px of figure), on a page
 * wider than the card, fading out to the right and at the bottom. Enough to
 * recognize it, never a reading surface. The document editor renders it,
 * read-only, so code blocks, callouts, task lists and mention pills look as
 * they do in the text itself.
 */
export function FadedExcerpt({ markdown }: { markdown: string }) {
  if (!markdown.trim()) return null;
  return (
    <div className={cn("pointer-events-none -mx-3 max-h-40 overflow-hidden pl-9", FADE_RIGHT_AND_BOTTOM, CONTENT_DIM)}>
      <div className="w-[30rem]">
        <LazyDocumentEditor value={markdown} readOnly size="compact" ariaLabel="" />
      </div>
    </div>
  );
}

function useRelativeTime() {
  const format = useFormatter();
  return (iso: string | null) => (iso ? format.relativeTime(new Date(iso), new Date()) : null);
}

/** A calendar day (`YYYY-MM-DD`), the same day in every time zone. */
const calendarDay = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);
const DAY = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" } as const;

function useDay() {
  const format = useFormatter();
  return (day: string) => format.dateTime(calendarDay(day), DAY);
}

/* ── Issues and objectives ─────────────────────────────────────────────── */

function IssuePreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "issue" }> }) {
  const members = new Map<string, Member>(preview.assignee ? [[preview.assignee.user_id, preview.assignee]] : []);
  const categories = new Map<string, IssueCardCategory>(preview.categories.map((category) => [category.id, category]));
  const objectives = new Map<string, IssueCardObjective>(preview.objective ? [[preview.objective.id, preview.objective]] : []);
  // The card's origin line reads only these columns of a project.
  const project = {
    id: preview.project.id,
    name: preview.project.name,
    key: preview.project.key,
    icon_url: preview.project.iconUrl,
    orb_seed: preview.project.orbSeed,
  } as Project;
  return (
    <div className="rounded-2xl shadow-md">
      <IssueCardBody
        issue={preview.issue}
        projectKey={preview.project.key}
        project={project}
        memberMap={members}
        categoryMap={categories}
        objectiveMap={objectives}
        parentNumber={preview.parentNumber ?? undefined}
        relations={preview.relations}
      />
    </div>
  );
}

function ObjectivePreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "objective" }> }) {
  const t = useTranslations("MentionPreview");
  const day = useDay();
  const { objective, lead } = preview;
  const progress = workProgress(preview.issues);
  return (
    <div className="flex flex-col gap-2">
      <ProjectLine project={preview.project} />
      {/* As its row in the objectives column: status, then the name in its color. */}
      <Head
        style={objectiveTextStyle(objective.color)}
        figure={<ObjectiveStatusIndicator status={objective.status} className="size-4" />}
        title={objective.name}
        titleClassName={OBJECTIVE_TEXT}
        // Its progress beside its name, as a routine's state: the ring and
        // the count of closed issues already say how many there are.
        aside={(
          <span className="flex shrink-0 items-center gap-2">
            <ObjectiveProgressStat progress={progress} countFirst />
            {lead && <UserAvatar seed={lead.avatar_seed} title={displayName(lead)} className="size-5 shrink-0" />}
          </span>
        )}
      />
      {objective.targetDate && (
        <p className="pl-6 text-xs text-muted-foreground">{t("target", { date: day(objective.targetDate) })}</p>
      )}
      {preview.relations.length > 0 && (
        <div className="pl-5">
          <RelationChips relations={preview.relations} projectKey={preview.project.key} />
        </div>
      )}
      <FadedExcerpt markdown={preview.excerpt} />
    </div>
  );
}

/* ── Documents ─────────────────────────────────────────────────────────── */

function PagePreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "page" }> }) {
  const t = useTranslations("MentionPreview");
  const tPages = useTranslations("Pages");
  const relative = useRelativeTime();
  const updated = relative(preview.updatedAt);
  return (
    <div className="flex flex-col gap-2">
      <ProjectLine project={preview.project} />
      <Head
        figure={preview.icon
          ? <span className="text-sm leading-none">{preview.icon}</span>
          : <HugeiconsIcon icon={preview.database ? DatabaseIcon : Book02Icon} className="size-4 text-(--mention-page)" aria-hidden />}
        title={preview.title.trim() || tPages("untitled")}
      />
      {updated && <p className="pl-6 text-xs text-muted-foreground">{t("updated", { when: updated })}</p>}
      {preview.database ? (
        <DatabaseRows database={preview.database} />
      ) : preview.excerpt ? (
        <FadedExcerpt markdown={preview.excerpt} />
      ) : (
        <p className="text-xs text-muted-foreground italic">{t("emptyPage")}</p>
      )}
    </div>
  );
}

/** Column widths of the real table (components/pages/page-database-view.tsx). */
const DATABASE_COLUMN_WIDTHS: Record<DatabasePropertyType, number> = {
  text: 240, number: 160, select: 192, multi_select: 240, created_at: 200, date: 176, people: 192, checkbox: 128,
};
const DATABASE_TITLE_WIDTH = 240;

/**
 * A database's first rows as its table draws them, at the table's own size:
 * the same header with each column's type icon, 40px rows, option badges and
 * checkboxes. What does not fit fades out to the right and at the bottom.
 */
function DatabaseRows({ database }: { database: NonNullable<Extract<MentionPreview, { type: "page" }>["database"]> }) {
  const t = useTranslations("MentionPreview");
  const tPages = useTranslations("Pages");
  const tDatabase = useTranslations("PageDatabase");
  const format = useFormatter();
  if (database.rows.length === 0) return <p className="text-xs text-muted-foreground italic">{t("emptyDatabase")}</p>;
  const columnWidth = (type: DatabasePropertyType) => DATABASE_COLUMN_WIDTHS[type] ?? DATABASE_TITLE_WIDTH;
  const width = DATABASE_TITLE_WIDTH + database.columns.reduce((total, column) => total + columnWidth(column.type), 0);
  return (
    <div className="flex flex-col gap-1">
      {/* The rows start under the card's title, as the table's start under
          the page title, past its gutter (pl-7: 12px of card padding, 24px
          of figure, less the cell's own 8px). */}
      <div
        className={cn("-mx-3 overflow-hidden pl-7", FADE_RIGHT_AND_BOTTOM, CONTENT_DIM)}
      >
        <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width }}>
          <colgroup>
            <col style={{ width: DATABASE_TITLE_WIDTH }} />
            {database.columns.map((column, index) => <col key={index} style={{ width: columnWidth(column.type) }} />)}
          </colgroup>
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="border-b border-border/50 p-1 font-normal">
                <span className="flex h-8 items-center gap-2 px-2">
                  <span className="min-w-0 truncate">{database.titleName ?? tDatabase("name")}</span>
                </span>
              </th>
              {database.columns.map((column, index) => (
                <th key={index} scope="col" className="border-b border-border/50 p-1 font-normal">
                  <span className="flex h-8 items-center gap-2 px-2">
                    <AppIcon icon={PROPERTY_ICONS[column.type]} className="size-3.5 shrink-0" />
                    <span className="min-w-0 truncate">{column.name}</span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {database.rows.map((row, index) => (
              <tr key={index} className="h-10">
                <td className="h-10 overflow-hidden border-b border-border/40 p-0">
                  <span className="flex h-10 min-w-0 items-center gap-2 overflow-hidden px-2">
                    {row.icon ?? <HugeiconsIcon icon={File02Icon} className="size-4 shrink-0 text-muted-foreground" />}
                    <span className="min-w-0 truncate">{row.title.trim() || tPages("untitled")}</span>
                  </span>
                </td>
                {row.cells.map((cell, column) => (
                  <td key={column} className="h-10 overflow-hidden border-b border-l border-border/30 p-0">
                    <span className="flex h-10 min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap px-2">
                      {cell.kind === "options" ? cell.options.map((option, item) => (
                        <OptionBadge key={item} option={{ id: String(item), ...option }} single={cell.single} />
                      )) : cell.kind === "checkbox" ? (
                        <Checkbox checked={cell.checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                      ) : cell.kind === "date" ? (
                        format.dateTime(new Date(cell.value.length === 10 ? `${cell.value}T00:00:00Z` : cell.value),
                          { dateStyle: "medium", ...(cell.value.length === 10 ? { timeZone: "UTC" } : {}) })
                      ) : (
                        <span className="min-w-0 truncate">{cell.text}</span>
                      )}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {database.total > database.rows.length && (
        <p className="text-xs text-muted-foreground">{t("moreRows", { count: database.total - database.rows.length })}</p>
      )}
    </div>
  );
}

function RoutinePreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "routine" }> }) {
  const t = useTranslations("MentionPreview");
  const relative = useRelativeTime();
  const next = preview.enabled ? relative(preview.nextRunAt) : null;
  const state = preview.enabled ? "active" : "paused";
  return (
    <div className="flex flex-col gap-2">
      <ProjectLine project={preview.project} />
      {/* Its state as the routine screen shows it, beside its name. */}
      <Head
        figure={<HugeiconsIcon icon={ROUTINE_ICON} className="size-4 text-amber-600" aria-hidden />}
        title={preview.title}
        aside={(
          <StateBadge className={ROUTINE_STATE_STYLES[state]} icon={ROUTINE_STATE_ICONS[state]}>
            {preview.enabled ? t("routineActive") : t("routinePaused")}
          </StateBadge>
        )}
      />
      {next && <p className="pl-6 text-xs text-muted-foreground">{t("nextRun", { when: next })}</p>}
      <FadedExcerpt markdown={preview.excerpt} />
    </div>
  );
}

function ScratchpadPreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "scratchpad" }> }) {
  const t = useTranslations("MentionPreview");
  const tCommon = useTranslations("Common");
  return (
    <div className="flex flex-col gap-2">
      <Head
        figure={<HugeiconsIcon icon={SCRATCHPAD_ICON} className="size-4 text-teal-600" aria-hidden />}
        title={tCommon("mentionScratchpad")}
        aside={preview.progress.total > 0
          ? <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{t("tasksDone", preview.progress)}</span>
          : null}
      />
      {preview.excerpt
        ? <FadedExcerpt markdown={preview.excerpt} />
        : <p className="text-xs text-muted-foreground italic">{t("emptyNotebook")}</p>}
    </div>
  );
}

function SkillPreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "skill" }> }) {
  return (
    <div className="flex flex-col gap-2">
      <Head
        figure={<HugeiconsIcon icon={Layers01Icon} className="size-4 text-emerald-600" aria-hidden />}
        title={preview.name}
      />
      {preview.description && <p className="pl-6 text-xs text-foreground/80">{preview.description}</p>}
      <FadedExcerpt markdown={preview.excerpt} />
    </div>
  );
}

/* ── Places and people ─────────────────────────────────────────────────── */

function ProjectPreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "project" }> }) {
  const t = useTranslations("MentionPreview");
  const { project } = preview;
  const more = preview.memberCount - preview.members.length;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {/* A rounded square in the pill's proportion (0.28 of its side): the
            theme's `rounded-lg` is 16px, which makes a 32px icon a disc. */}
        <ProjectOrb seed={project.orbSeed} iconUrl={project.iconUrl} className="size-8 shrink-0 rounded-[9px]" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{project.name}</p>
          <p className="font-mono text-[11px] text-muted-foreground">{project.key}</p>
        </div>
      </div>
      {/* Who works in it, and as what. */}
      <ul className="flex flex-col gap-1.5 border-t border-border pt-2.5">
        {preview.members.map((member) => (
          <li key={member.userId} className="flex min-w-0 items-center gap-2 text-xs">
            <UserAvatar seed={member.avatarSeed} className="size-5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{member.name}</span>
            <RoleBadge role={member.role} />
          </li>
        ))}
      </ul>
      {more > 0 && <p className="-mt-1.5 text-xs text-muted-foreground">{t("moreMembers", { count: more })}</p>}
    </div>
  );
}

function MemberPreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "member" }> }) {
  const t = useTranslations("MentionPreview");
  const format = useFormatter();
  const { membership } = preview;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar seed={preview.avatarSeed} className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{preview.name}</p>
          {preview.email && <p className="truncate text-xs text-muted-foreground">{preview.email}</p>}
        </div>
        {membership && <RoleBadge role={membership.role} />}
      </div>
      {membership && (
        <p className="truncate border-t border-border pt-2 text-xs text-muted-foreground">
          {membership.joinedAt
            ? t("joinedProject", {
                project: membership.projectName,
                date: format.dateTime(new Date(membership.joinedAt), { day: "numeric", month: "short", year: "numeric" }),
              })
            : t("ownsProject", { project: membership.projectName })}
        </p>
      )}
    </div>
  );
}

/* ── Features ──────────────────────────────────────────────────────────── */

function CyclePreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "cycle" }> }) {
  const t = useTranslations("MentionPreview");
  const tCommon = useTranslations("Common");
  const format = useFormatter();
  const progress = workProgress(preview.issues);
  // The stored end is exclusive: the window ends the day before.
  const last = calendarDay(preview.endDate);
  last.setUTCDate(last.getUTCDate() - 1);
  return (
    <div className="flex flex-col gap-2">
      <Head
        figure={<HugeiconsIcon icon={CYCLE_ICON} className="size-4 text-teal-600" aria-hidden />}
        title={`${tCommon("mentionCycle")} ${format.dateTimeRange(calendarDay(preview.startDate), last, { day: "numeric", month: "short", timeZone: "UTC" })}`}
      />
      <div className="flex items-center gap-2 pl-6">
        <span className="text-xs text-muted-foreground">{t("issueCount", { count: progress.total })}</span>
        <ObjectiveProgressStat progress={progress} countFirst className="ml-auto" />
      </div>
    </div>
  );
}

function PullRequestPreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "pull_request" }> }) {
  const t = useTranslations("MentionPreview");
  const relative = useRelativeTime();
  const tone = {
    open: "text-emerald-600 dark:text-emerald-500",
    draft: "text-muted-foreground",
    merged: "text-violet-700 dark:text-violet-400",
    closed: "text-red-600 dark:text-red-400",
  }[preview.state];
  const when = preview.state === "merged" ? relative(preview.mergedAt) : relative(preview.openedAt);
  return (
    <div className="flex flex-col gap-2">
      <Head
        figure={<HugeiconsIcon icon={PULL_REQUEST_ICON} className={cn("size-4", tone)} aria-hidden />}
        title={<><span className="font-mono text-muted-foreground">#{preview.number}</span> {preview.title ?? ""}</>}
      />
      <div className="pl-6">
        <Facts>{[
          <span key="state" className={cn("font-medium", tone)}>{t(`pr_${preview.state}`)}</span>,
          <span key="repo" className="truncate">{preview.repository}</span>,
          when ? <span key="when">{preview.state === "merged" ? t("merged", { when }) : t("opened", { when })}</span> : null,
        ]}</Facts>
      </div>
      {(preview.headBranch || preview.author) && (
        <div className="flex min-w-0 items-center gap-2 pl-6 text-xs text-muted-foreground">
          {preview.author && (
            <span className="flex min-w-0 items-center gap-1">
              <UserAvatar url={preview.author.avatarUrl} seed={preview.author.login} className="size-4 shrink-0" />
              <span className="truncate">{preview.author.login}</span>
            </span>
          )}
          {preview.headBranch && (
            <span className="flex min-w-0 items-center gap-1 font-mono text-[11px]">
              <HugeiconsIcon icon={GitBranchIcon} className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{preview.headBranch}{preview.baseBranch ? ` → ${preview.baseBranch}` : ""}</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** How many tools a server exposes takes a live connection: asked only
    once its card is open, and kept a while. */
function useMcpToolCount(id: string, enabled: boolean) {
  return useQuery({
    queryKey: ["mention-preview", "mcp-tools", id],
    queryFn: async () => {
      const response = await fetch(`/api/account/mcp-connections/${encodeURIComponent(id)}/test`, { method: "POST" });
      if (!response.ok) throw new Error("MCP server unreachable");
      return ((await response.json()) as { tools: number }).tools;
    },
    enabled,
    staleTime: 10 * 60_000,
    retry: false,
  });
}

function McpPreviewCard({ preview }: { preview: Extract<MentionPreview, { type: "mcp" }> }) {
  const t = useTranslations("MentionPreview");
  const reachable = preview.enabled && preview.connected;
  const tools = useMcpToolCount(preview.id, reachable);
  const [label, tone] = !preview.enabled ? [t("mcpDisabled"), MCP_STATE_STYLES.off]
    : preview.auth === "oauth"
      ? (preview.connected ? [t("mcpSignedIn"), MCP_STATE_STYLES.ok] : [t("mcpSignInNeeded"), MCP_STATE_STYLES.warn])
      : preview.auth === "token" ? [t("mcpKey"), MCP_STATE_STYLES.ok]
      : [t("mcpNoAuth"), MCP_STATE_STYLES.off];
  return (
    <div className="flex flex-col gap-2">
      {/* Its state beside its name, as a routine's. */}
      <Head
        figure={<McpServiceLogo service={preview.service ?? undefined} className="size-4" />}
        title={preview.name}
        aside={<StateBadge className={tone}>{label}</StateBadge>}
      />
      {reachable && (
        <p className="pl-6 text-xs tabular-nums text-muted-foreground">
          {tools.isPending ? t("mcpCountingTools")
            : tools.data === undefined ? t("mcpToolsUnavailable")
            : t("mcpTools", { count: tools.data })}
        </p>
      )}
    </div>
  );
}

const MCP_STATE_STYLES = {
  ok: "bg-green-600/10 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  warn: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-400",
  off: "bg-muted text-muted-foreground",
} as const;
