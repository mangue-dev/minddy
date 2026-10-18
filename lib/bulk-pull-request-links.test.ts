import { describe, expect, it } from "vitest";
import type { IssuePr, PullRequestListItem } from "./agent-api";
import { bulkPullRequestLinks } from "./bulk-pull-request-links";

const openPr = (prId: string, number: number, projectId: string, state: "open" | "draft" = "open") => ({
  prId, pr_number: number, pr_state: state, title: `PR ${number}`, head_branch: null,
  project: { id: projectId, key: "K", name: "P", icon_url: null, orb_seed: null },
}) as unknown as PullRequestListItem;

const prs: Record<string, IssuePr> = {
  linked: { prId: "pr-447", prNumber: 447, state: "open" },
};
const prOf = (id: string) => prs[id] ?? null;

describe("bulkPullRequestLinks", () => {
  it("offers the open pull requests of the selection's projects only", () => {
    const { options } = bulkPullRequestLinks(
      [{ id: "a", project_id: "p1" }],
      prOf,
      [openPr("pr-1", 1, "p1"), openPr("pr-2", 2, "p2"), openPr("pr-3", 3, "p1", "draft")],
    );
    expect(options.map((pr) => pr.prNumber)).toEqual([1, 3]);
  });

  it("extends a pull request some selected tickets have to the others of its project", () => {
    const links = bulkPullRequestLinks(
      [{ id: "linked", project_id: "p1" }, { id: "other", project_id: "p1" }, { id: "elsewhere", project_id: "p2" }],
      prOf,
      [openPr("pr-447", 447, "p1")],
    );
    expect(links.partial).toEqual([expect.objectContaining({ prId: "pr-447", prNumber: 447, missing: 1 })]);
    // Only the unlinked ticket of the PR's project is targeted.
    expect(links.targets("pr-447")).toEqual(["other"]);
  });

  it("offers nothing to extend when every ticket of the project already has the pull request", () => {
    const links = bulkPullRequestLinks([{ id: "linked", project_id: "p1" }], prOf, [openPr("pr-447", 447, "p1")]);
    expect(links.partial).toEqual([]);
  });
});
