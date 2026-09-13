import { describe, expect, it } from "vitest";
import { validateMessageContext } from "./message-context";
import { buildPageContextBlock } from "./prompt";

function client(visible: Set<string>) {
  return { from: (table: string) => {
    let id: string;
    const query = {
      select: () => query,
      eq: (_key: string, value: string) => { id = value; return query; },
      is: () => query,
      maybeSingle: async () => ({ data: visible.has(id)
        ? { id, ...(table !== "projects" ? { project_id: id.endsWith("-a") ? "a" : "b" } : {}) }
        : null }),
    };
    return query;
  } } as never;
}

describe("per-message context authorization", () => {
  it("keeps ambient B, pinned A and mentions from both projects attached to their sources", async () => {
    const supabase = client(new Set(["a", "b", "issue-a", "page-b"]));
    const result = await validateMessageContext(supabase, {
      projectId: "b", pinned: [{ kind: "issue", id: "issue-a", label: "A-1" }],
    }, [{ type: "page", id: "page-b", label: "Guide", projectId: "a" }]);
    expect(result).toMatchObject({
      context: { projectId: "b", pinned: [{ id: "issue-a", projectId: "a" }] },
      mentions: [{ id: "page-b", projectId: "b" }],
    });
    expect(buildPageContextBlock(result!.context!)).toContain("project id: a");
  });
  it("derives an ambient resource's project when no project was supplied", async () => {
    expect(await validateMessageContext(client(new Set(["a", "issue-a"])), { issueId: "issue-a" }, []))
      .toMatchObject({ context: { issueId: "issue-a", projectId: "a" } });
  });
  it("retains each project's provenance in a cross-project issue selection", async () => {
    const result = await validateMessageContext(client(new Set(["a", "b", "issue-a", "issue-b"])), { issueIds: ["issue-a", "issue-b"] }, []);
    expect(result?.context?.issueProjectIds).toEqual(["a", "b"]);
    const prompt = buildPageContextBlock(result!.context!);
    expect(prompt).toContain("(id: issue-a) in project (id: a)");
    expect(prompt).toContain("(id: issue-b) in project (id: b)");
  });
  it("refuses stale or revoked project context on the next send", async () => {
    const visible = new Set(["a", "issue-a"]);
    const supabase = client(visible);
    const context = { projectId: "a", pinned: [{ kind: "issue" as const, id: "issue-a", label: "A-1" }] };
    expect(await validateMessageContext(supabase, context, [])).not.toBeNull();
    visible.delete("a");
    expect(await validateMessageContext(supabase, context, [])).toBeNull();
  });
  it("rejects mismatched ambient provenance and unavailable mentions", async () => {
    const supabase = client(new Set(["a", "b", "issue-a"]));
    expect(await validateMessageContext(supabase, { projectId: "b", issueId: "issue-a" }, [])).toBeNull();
    expect(await validateMessageContext(supabase, null, [{ type: "page", id: "missing", label: "Guide" }])).toBeNull();
  });
  it("derives canonical pull request context without requiring an issue", async () => {
    const supabase = {
      from: (table: string) => {
        const filters: Record<string, string> = {};
        const query = {
          select: () => query,
          eq: (key: string, value: string) => {
            filters[key] = value;
            return query;
          },
          is: () => query,
          maybeSingle: async () => ({
            data:
              table === "pull_requests" && filters.id === "pr-1"
                ? {
                    id: "pr-1",
                    provider: "github",
                    repo_full_name: "mangue-dev/minddy",
                    number: 42,
                    state: "open",
                    head_branch: "work/min-42",
                    base_branch: "main",
                    issue_id: null,
                  }
                : table === "projects" && filters.id === "project-1"
                  ? { id: "project-1" }
                  : null,
          }),
          limit: async () => ({
            data:
              table === "project_git_links" &&
              filters.provider === "github" &&
              filters.repo_full_name === "mangue-dev/minddy"
                ? [{ project_id: "project-1" }]
                : [],
          }),
        };
        return query;
      },
    } as never;

    const result = await validateMessageContext(
      supabase,
      { pullRequestId: "pr-1" },
      [],
    );
    expect(result?.context).toMatchObject({
      projectId: "project-1",
      pullRequestId: "pr-1",
      prNumber: 42,
      prState: "open",
      prHeadRef: "work/min-42",
      prBaseRef: "main",
    });
    expect(buildPageContextBlock(result!.context!)).toContain(
      'read_pull_request { pull_request_id: "pr-1" }',
    );
  });
});
