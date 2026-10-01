import { filterLinkedIssueRuns } from "./activity";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listIssuePullRequests } from "./issue-pull-requests";

function client(data: unknown[], error: { message: string } | null = null) {
  const filters: [string, string][] = [];
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { filters.push([key, value]); return query; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve),
  };
  return { supabase: { from: () => query } as unknown as SupabaseClient, filters };
}

const pr = (id: string, updated_at: string) => ({ id, updated_at, number: 42, state: "open", provider: "github", repo_full_name: "example/repo" });

describe("listIssuePullRequests", () => {
  it("returns the same PR for every associated issue and sorts by PR freshness", async () => {
    const { supabase } = client([
      { issue_id: "first", issue: { project_id: "project" }, pull_request: pr("old", "2026-01-01") },
      { issue_id: "second", issue: { project_id: "project" }, pull_request: pr("new", "2026-02-01") },
      { issue_id: "third", issue: { project_id: "project" }, pull_request: pr("new", "2026-02-01") },
    ]);
    const rows = await listIssuePullRequests(supabase);
    expect(rows.map((row) => [row.id, row.issue_id])).toEqual([["new", "second"], ["new", "third"], ["old", "first"]]);
  });

  it("restricts the junction by issue and project before returning associations", async () => {
    const { supabase, filters } = client([]);
    await listIssuePullRequests(supabase, { issueId: "issue", projectId: "project" });
    expect(filters).toEqual([["issue_id", "issue"], ["issue.project_id", "project"]]);
  });

  it("reports failed association reads instead of silently clearing PR chips", async () => {
    const { supabase } = client([], { message: "Read failed" });
    await expect(listIssuePullRequests(supabase)).rejects.toThrow("Read failed");
  });
});

// An old worker context must not recreate activity after a manual detachment.
describe("filterLinkedIssueRuns", () => {
  it("keeps current associations and notebook runs, omitting detached worker issues", () => {
    const linked = { issueId: "linked", id: "run-1" };
    const detached = { issueId: "detached", id: "run-2" };
    const notebook = { issueId: null, id: "run-3" };
    expect(filterLinkedIssueRuns([linked, detached, notebook], ["linked"]))
      .toEqual([linked, notebook]);
  });
});
