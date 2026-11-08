import "server-only";

import { type ReadContext } from "@/lib/server/issue-reads";
import { listPagesForAgent, readPageForAgent } from "@/lib/server/page-tools";
import { loadProjectIssues } from "@/lib/server/project-working-set-readers";
import { dayInZone } from "@/lib/stats-derive";
import { issueIdentifier } from "@/lib/issue-constants";
import { mentionLinks } from "@/lib/mention-link";
import {
  FORGOTTEN_BACKLOG_DAYS,
  FORGOTTEN_DAYS,
  FORGOTTEN_MIN_OPEN,
  forgottenIssues,
} from "@/lib/project-stats";

/**
 * Isolated items of a project (MIN-932), for Numo's `find_isolated_items`:
 * short candidate lists Numo judges before telling the user, never an audit.
 *
 * - Forgotten tickets: open work idle for a while (`forgottenIssues`), only
 *   in a project with enough open tickets.
 * - Pages with no ticket: recent pages whose text cites no ticket and that no
 *   ticket cites, with an excerpt. Whether a page describes work to do (a fix,
 *   a problem, a task) is Numo's call: a page of notes or a finished spec is
 *   isolated on purpose.
 *
 * The caller has already checked read access to the project.
 */

/** Forgotten tickets listed at most, the longest idle first. */
export const ISOLATED_ISSUES_LISTED = 8;
/** Recent pages read to look for ones with no ticket. */
export const PAGES_EXAMINED = 15;
/** Pages with no ticket listed at most. */
export const ISOLATED_PAGES_LISTED = 6;
/** A page shorter than this says too little to be work to do. */
const MIN_PAGE_TEXT = 120;
const EXCERPT_CHARS = 400;

export interface IsolatedItems {
  forgotten_issues: Array<{
    id: string;
    identifier: string;
    title: string;
    status: string;
    assignee_id: string | null;
    last_change: string;
    idle_days: number;
  }>;
  /** Why the list is empty or short, so Numo can say it plainly. */
  forgotten_rule: string;
  pages_without_issue: Array<{
    page_id: string;
    title: string;
    updated_at: string;
    excerpt: string;
  }>;
  pages_examined: number;
}

function idleDays(updatedAt: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - Date.parse(updatedAt)) / 86_400_000));
}

/** Whether a page is tied to a ticket: it cites one, or one cites it. */
export function pageHasIssue(markdown: string, backlinks: ReadonlyArray<{ kind: string }>): boolean {
  return backlinks.some((link) => link.kind === "issue") ||
    mentionLinks(markdown).some((link) => link.type === "issue");
}

export async function findIsolatedItems(
  ctx: ReadContext,
  { timeZone, now = new Date() }: { timeZone?: string | null; now?: Date } = {},
): Promise<IsolatedItems | { error: string }> {
  if (!ctx.actorId) return { error: "A signed-in user is required." };
  const actorId = ctx.actorId;
  const today = dayInZone(now.toISOString(), timeZone || "UTC") ?? now.toISOString().slice(0, 10);

  const [issuesResult, pagesResult] = await Promise.all([
    loadProjectIssues({ supabase: ctx.db, user: { id: actorId } }, ctx.projectId),
    listPagesForAgent({ projectId: ctx.projectId, actorId }),
  ]);
  if (!issuesResult.ok) return { error: "The project's issues could not be read." };

  const forgotten = forgottenIssues(issuesResult.data, today)
    .slice(0, ISOLATED_ISSUES_LISTED)
    .map((issue) => ({
      id: issue.id,
      identifier: issueIdentifier(ctx.projectKey, issue.number),
      title: issue.title,
      status: issue.status,
      assignee_id: issue.assignee_id,
      last_change: issue.updated_at,
      idle_days: idleDays(issue.updated_at, now),
    }));

  const candidates = pagesResult.ok
    ? pagesResult.data.pages
      .filter((page) => !(page.database_schema && page.database_schema.length > 0))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, PAGES_EXAMINED)
    : [];
  const reads = await Promise.all(candidates.map((page) =>
    readPageForAgent({ pageId: page.page_id, projectId: ctx.projectId, actorId })
      .catch(() => null)));
  const pages: IsolatedItems["pages_without_issue"] = [];
  for (const read of reads) {
    if (!read?.ok || read.data.is_database) continue;
    const { markdown, backlinks } = read.data;
    if (markdown.trim().length < MIN_PAGE_TEXT || pageHasIssue(markdown, backlinks)) continue;
    pages.push({
      page_id: read.data.page_id,
      title: read.data.title,
      updated_at: read.data.updated_at,
      excerpt: markdown.trim().slice(0, EXCERPT_CHARS),
    });
    if (pages.length >= ISOLATED_PAGES_LISTED) break;
  }

  return {
    forgotten_issues: forgotten,
    forgotten_rule: `Open issues idle for ${FORGOTTEN_DAYS} days (${FORGOTTEN_BACKLOG_DAYS} for backlog), only in a project with at least ${FORGOTTEN_MIN_OPEN} open issues; triage is left out.`,
    pages_without_issue: pages,
    pages_examined: candidates.length,
  };
}
