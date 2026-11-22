import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MIN-952: a Numo tool call that names an issue by `issue_id` runs in that
 * issue's project when it passes no `project_id`. The lookup itself
 * (`locateIssueProject`) is covered with the MCP; here, only when it is used.
 */

const locate = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/issue-reads", () => ({ locateIssueProject: locate }));

const { withIssueProject } = await import("./project-scope");
const { ISSUE_TARGETED_TOOLS } = await import("./tools");

const ctx = { userId: "user-1", service: {} as never };
const ISSUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  locate.mockReset();
  locate.mockResolvedValue({ projectId: PROJECT });
});

describe("withIssueProject", () => {
  it("fills project_id from the issue the call names", async () => {
    expect(await withIssueProject(ctx, { issue_id: ISSUE })).toEqual({ issue_id: ISSUE, project_id: PROJECT });
    expect(locate).toHaveBeenCalledWith(ctx.service, "user-1", ISSUE);
  });

  it("keeps an explicit project_id, which the access check then holds to", async () => {
    const args = { project_id: "other", issue_id: ISSUE };
    expect(await withIssueProject(ctx, args)).toBe(args);
    expect(locate).not.toHaveBeenCalled();
  });

  it("leaves a call without an issue UUID, or an issue the user cannot open, unchanged", async () => {
    const byNumber = { number: 42 };
    expect(await withIssueProject(ctx, byNumber)).toBe(byNumber);
    locate.mockResolvedValue({ code: "issue_not_found", error: "not found" });
    const hidden = { issue_id: ISSUE };
    expect(await withIssueProject(ctx, hidden)).toBe(hidden);
  });

  it("applies to the project tools that name one issue, and no others", () => {
    expect(ISSUE_TARGETED_TOOLS.has("get_issue")).toBe(true);
    expect(ISSUE_TARGETED_TOOLS.has("add_comment")).toBe(true);
    expect(ISSUE_TARGETED_TOOLS.has("list_issues")).toBe(false);
    expect(ISSUE_TARGETED_TOOLS.has("create_watch")).toBe(false);
  });
});
