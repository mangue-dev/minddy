import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScopedIssuePrRow } from "./activity";

/** Flatten junction rows into the existing per-issue activity contract. */
export async function listIssuePullRequests(
  client: SupabaseClient,
  scope: { issueId?: string; projectId?: string } = {},
): Promise<ScopedIssuePrRow[]> {
  let query = client.from("pull_request_issues")
    .select("issue_id, issue:issues!inner(project_id), pull_request:pull_requests!inner(id, number, state, updated_at, provider, repo_full_name)");
  if (scope.issueId) query = query.eq("issue_id", scope.issueId);
  if (scope.projectId) query = query.eq("issue.project_id", scope.projectId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const links = (data ?? []) as unknown as {
    issue_id: string;
    issue: ScopedIssuePrRow["issue"];
    pull_request: Omit<ScopedIssuePrRow, "issue_id" | "issue">;
  }[];
  return links.map((link) => ({ ...link.pull_request, issue_id: link.issue_id, issue: link.issue }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

/** The dates of one pull request linked to a ticket of the project. */
export interface ProjectPullRequestTimelineRow {
  id: string;
  state: "draft" | "open" | "merged" | "closed";
  openedAt: string | null;
  mergedAt: string | null;
  issueIds: string[];
}

/**
 * Every pull request linked to a ticket of one project, once, with its
 * dates — what the project statistics (MIN-878) count. Same inner join on
 * the ticket as `listIssuePullRequests`, so RLS on `issues` scopes it; no
 * title, URL or repository name is read.
 */
export async function listProjectPullRequestTimeline(
  client: SupabaseClient,
  projectId: string,
): Promise<ProjectPullRequestTimelineRow[]> {
  const { data, error } = await client.from("pull_request_issues")
    .select("issue_id, issue:issues!inner(project_id), pull_request:pull_requests!inner(id, state, opened_at, merged_at, created_at)")
    .eq("issue.project_id", projectId);
  if (error) throw new Error(error.message);
  const links = (data ?? []) as unknown as {
    issue_id: string;
    pull_request: { id: string; state: string; opened_at: string | null; merged_at: string | null; created_at: string };
  }[];
  const byId = new Map<string, ProjectPullRequestTimelineRow>();
  for (const link of links) {
    const pr = link.pull_request;
    let row = byId.get(pr.id);
    if (!row) {
      const state = pr.state === "draft" || pr.state === "merged" || pr.state === "closed" ? pr.state : "open";
      // A row synced before `opened_at` existed still has its creation date.
      row = { id: pr.id, state, openedAt: pr.opened_at ?? pr.created_at, mergedAt: pr.merged_at, issueIds: [] };
      byId.set(pr.id, row);
    }
    if (!row.issueIds.includes(link.issue_id)) row.issueIds.push(link.issue_id);
  }
  return [...byId.values()];
}
