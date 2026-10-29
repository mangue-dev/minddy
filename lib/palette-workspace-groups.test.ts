import { describe, expect, it, vi } from "vitest";
import type { PullRequestListItem } from "./agent-api";
import type { MyNotification } from "./types";
import { buildWorkspaceGroups, type WorkspaceGroupInput } from "./palette-workspace-groups";

const visible = { id: "p1", name: "Minddy", key: "MIN" };
const hidden = { id: "p-hidden", name: "Hidden", key: "HID" };

function pr(id: string, fields: Partial<PullRequestListItem> = {}): PullRequestListItem {
  return {
    prId: id, pr_number: 12, pr_url: null, pr_state: "open", provider: "github",
    title: "Add palette rows", author: { login: "ana", avatar_url: null },
    head_branch: "work/palette", created_at: "", updated_at: "", issue: null,
    project: { ...visible, icon_url: null, orb_seed: null },
    ...fields,
  };
}

function input(fields: Partial<WorkspaceGroupInput> = {}): WorkspaceGroupInput {
  return {
    routines: [],
    pullRequests: [],
    views: [],
    notifications: [],
    projectById: new Map([[visible.id, visible]]),
    labels: {
      routines: "Routines", pullRequests: "Code review", views: "Views",
      notifications: "Inbox", globalBoard: "All issues",
      notificationTitle: (n) => n.issue_title ?? "?",
      notificationLine: () => "Ana commented",
    },
    navigate: vi.fn(),
    openNotification: vi.fn(),
    ...fields,
  };
}

describe("buildWorkspaceGroups (MIN-846)", () => {
  it("returns no group when there is nothing to search", () => {
    expect(buildWorkspaceGroups(input())).toEqual([]);
  });

  it("makes every row search-only and opens routines, PRs and views at their address", () => {
    const navigate = vi.fn();
    const groups = buildWorkspaceGroups(input({
      navigate,
      routines: [{ id: "r1", project_id: "p1", title: "Weekly triage" }],
      pullRequests: [pr("pr1"), pr("pr2", { title: null, pr_number: 7, pr_state: "merged" })],
      views: [
        { id: "v-global", project_id: null, name: "My week" },
        { id: "v1", project_id: "p1", name: "Bugs" },
      ],
    }));

    expect(groups.map((g) => g.key)).toEqual(["routines", "pull-requests", "board-views"]);
    const rows = groups.flatMap((g) => g.items);
    expect(rows.every((row) => row.searchOnly)).toBe(true);
    expect(rows.map((row) => row.href)).toEqual([
      "/routines?routine=r1",
      "/pull-requests?pr=pr1",
      "/pull-requests?pr=pr2",
      "/all?view=v-global",
      "/projects/p1?view=v1",
    ]);
    // An untitled pull request still reads as its number, which also matches.
    const untitled = groups[1].items[1];
    expect(untitled.label).toBe("#7");
    expect(untitled.keywords).toContain("7");
    // A global view names the board it belongs to.
    expect(groups[2].items[0].metaText).toBe("All issues");

    groups[0].items[0].onSelect?.();
    expect(navigate).toHaveBeenCalledWith("/routines?routine=r1");
  });

  it("drops rows of hidden projects but keeps PRs of a repository without project", () => {
    const groups = buildWorkspaceGroups(input({
      routines: [{ id: "r-hidden", project_id: hidden.id, title: "Hidden routine" }],
      pullRequests: [
        pr("pr-hidden", { project: { ...hidden, icon_url: null, orb_seed: null } }),
        pr("pr-orphan", { project: null }),
      ],
      views: [{ id: "v-hidden", project_id: hidden.id, name: "Hidden view" }],
    }));
    expect(groups.flatMap((g) => g.items.map((row) => row.key))).toEqual(["pull-request-pr-orphan"]);
  });

  it("opens the inbox on a notification and matches its identifier", () => {
    const openNotification = vi.fn();
    const notification = {
      id: "n1", type: "comment", project_id: "p1", project_key: "MIN",
      issue_number: 42, issue_title: "Fix the pulse", pull_request_number: null,
      from_numo: false,
    } as MyNotification;
    const [group] = buildWorkspaceGroups(input({ notifications: [notification], openNotification }));

    expect(group.key).toBe("notifications");
    const [row] = group.items;
    expect(row).toMatchObject({
      label: "Fix the pulse",
      description: "Ana commented",
      metaText: "MIN-42",
      entityType: "notification",
      searchOnly: true,
    });
    expect(row.href).toBeUndefined();
    row.onSelect?.();
    expect(openNotification).toHaveBeenCalledWith("n1");
  });
});
