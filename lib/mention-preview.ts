import type { IssueEffort, IssueStatus } from "@/lib/issue-constants";
import type { MentionLinkType } from "@/lib/mention-link";
import type { DatabasePropertyType } from "@/lib/page-databases";
import type { ObjectiveStatus } from "@/lib/objective-validation";
import type { ProjectRole } from "@/lib/project-roles";
import type { DisplayRelation } from "@/lib/relation-constants";
import type { IssueCardCategory, IssueCardIssue, IssueCardObjective, Member } from "@/lib/types";

/**
 * What the hover card of a mention shows (MIN-879), one shape per target
 * type. The server answers it (`GET /api/mentions/preview`,
 * lib/server/mention-preview.ts) only for a target the reader may open, under
 * the rules that decide its label; anything else is `null`.
 *
 * Excerpts are Markdown cut to a few lines: the card renders them with the
 * read-only document editor, whose typed mentions resolve for the reader like
 * any other pill, never with a stored label.
 */

/** Types with a hover card. A date keeps its relative tooltip, and a
    resource opens its own preview from the surface that holds it. */
export const PREVIEW_MENTION_TYPES = [
  "issue",
  "objective",
  "page",
  "project",
  "member",
  "routine",
  "scratchpad",
  "cycle",
  "pull_request",
  "mcp",
  "skill",
] as const satisfies readonly MentionLinkType[];

export type PreviewMentionType = (typeof PREVIEW_MENTION_TYPES)[number];

export function isPreviewMentionType(value: unknown): value is PreviewMentionType {
  return (PREVIEW_MENTION_TYPES as readonly unknown[]).includes(value);
}

/** The project an issue, objective, page or routine belongs to. */
export interface PreviewProject {
  id: string;
  name: string;
  key: string;
  orbSeed: string;
  iconUrl: string | null;
}

export interface IssuePreview {
  type: "issue";
  project: PreviewProject;
  /** What the board card reads, plan included for its progress. */
  issue: IssueCardIssue;
  assignee: Member | null;
  categories: IssueCardCategory[];
  objective: IssueCardObjective | null;
  parentNumber: number | null;
  relations: DisplayRelation[];
}

export interface ObjectivePreview {
  type: "objective";
  project: PreviewProject;
  objective: {
    id: string;
    name: string;
    color: string | null;
    status: ObjectiveStatus;
    targetDate: string | null;
  };
  /** Markdown, cut. */
  excerpt: string;
  lead: Pick<Member, "user_id" | "email" | "full_name" | "avatar_seed"> | null;
  /** Its tickets' statuses and efforts: the progress the app shows elsewhere. */
  issues: Array<{ status: IssueStatus; effort: IssueEffort | null }>;
  relations: DisplayRelation[];
}

export interface PagePreview {
  type: "page";
  project: PreviewProject;
  title: string;
  icon: string | null;
  updatedAt: string | null;
  /** Markdown of the body, cut. Empty for a database. */
  excerpt: string;
  /** A database's first rows, in its first visible columns, as its table
      shows them. */
  database: {
    /** The title column's name, when the database renamed it. */
    titleName: string | null;
    columns: Array<{ name: string; type: DatabasePropertyType }>;
    rows: Array<{ title: string; icon: string | null; cells: DatabasePreviewCell[] }>;
    total: number;
  } | null;
}

/** A database cell as the card draws it: the value, never an editor. */
export type DatabasePreviewCell =
  | { kind: "text"; text: string }
  | { kind: "options"; options: Array<{ name: string; color: string }>; single: boolean }
  | { kind: "checkbox"; checked: boolean }
  | { kind: "date"; value: string };

/** A database card shows the first rows, under a fade. */
export const DATABASE_PREVIEW_ROWS = 4;
/** And the first columns, also under a fade. */
export const DATABASE_PREVIEW_COLUMNS = 5;

export interface ProjectPreview {
  type: "project";
  project: PreviewProject;
  /** The owner first, then members by arrival, up to `PROJECT_PREVIEW_MEMBERS`. */
  members: Array<{ userId: string; name: string; avatarSeed: string; role: ProjectRole }>;
  /** Every member, owner included. */
  memberCount: number;
}

export const PROJECT_PREVIEW_MEMBERS = 8;

export interface MemberPreview {
  type: "member";
  name: string;
  email: string | null;
  avatarSeed: string;
  /** In the project the mention is read in when the reader shares it,
      otherwise in a project both share. */
  membership: { projectName: string; role: ProjectRole; joinedAt: string | null } | null;
}

export interface RoutinePreview {
  type: "routine";
  project: PreviewProject;
  title: string;
  /** The instruction, Markdown, cut. */
  excerpt: string;
  enabled: boolean;
  nextRunAt: string | null;
}

export interface ScratchpadPreview {
  type: "scratchpad";
  excerpt: string;
  progress: { done: number; total: number };
  updatedAt: string | null;
}

export interface CyclePreview {
  type: "cycle";
  startDate: string;
  /** Exclusive, as cycles store it. */
  endDate: string;
  issues: Array<{ status: IssueStatus; effort: IssueEffort | null }>;
}

export interface PullRequestPreview {
  type: "pull_request";
  number: number;
  title: string | null;
  state: "draft" | "open" | "merged" | "closed";
  repository: string;
  headBranch: string | null;
  baseBranch: string | null;
  author: { login: string; avatarUrl: string | null } | null;
  openedAt: string | null;
  mergedAt: string | null;
}

export interface McpPreview {
  type: "mcp";
  id: string;
  name: string;
  /** A known service (`lib/mcp-catalog.ts`), for its logo. */
  service: string | null;
  enabled: boolean;
  /** `oauth`: signed in when `connected`; `token`: a stored key; `none`. */
  auth: "oauth" | "token" | "none";
  connected: boolean;
}

export interface SkillPreview {
  type: "skill";
  name: string;
  description: string | null;
  /** The SKILL.md instructions, Markdown, cut. */
  excerpt: string;
}

export type MentionPreview =
  | IssuePreview
  | ObjectivePreview
  | PagePreview
  | ProjectPreview
  | MemberPreview
  | RoutinePreview
  | ScratchpadPreview
  | CyclePreview
  | PullRequestPreview
  | McpPreview
  | SkillPreview;

/** How much of a text a card keeps: a few lines under a fade. */
export const EXCERPT_CHARS = 900;

/**
 * A Markdown text cut at a line boundary near `EXCERPT_CHARS`. A code block
 * or a callout the cut left open is closed, so the rest of the excerpt does
 * not turn into code or callout when it is rendered.
 */
export function cutExcerpt(markdown: string | null | undefined): string {
  const text = (markdown ?? "").replace(/\r\n?/g, "\n").trim();
  if (text.length <= EXCERPT_CHARS) return text;
  const cut = text.slice(0, EXCERPT_CHARS);
  const line = cut.lastIndexOf("\n");
  let kept = (line > EXCERPT_CHARS / 2 ? cut.slice(0, line) : cut).trimEnd();
  const fences = kept.split("\n").filter((row) => /^\s*(```|~~~)/.test(row)).length;
  if (fences % 2 === 1) kept += "\n```";
  const opened = (kept.match(/<aside\b/gi) ?? []).length - (kept.match(/<\/aside>/gi) ?? []).length;
  if (opened > 0) kept += "\n\n</aside>".repeat(opened);
  return `${kept}\n\n…`;
}
