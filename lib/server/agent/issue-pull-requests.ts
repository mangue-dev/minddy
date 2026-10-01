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
