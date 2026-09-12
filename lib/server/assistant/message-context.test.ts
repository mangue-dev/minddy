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
});
