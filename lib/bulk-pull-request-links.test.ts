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

  it("offers a pull request for a selection whose links are only merged or closed", () => {
    const history: Record<string, IssuePr> = {
      done: { prId: "pr-merged", prNumber: 40, state: "merged" },
      dropped: { prId: "pr-closed", prNumber: 41, state: "closed" },
    };
    const links = bulkPullRequestLinks(
      [{ id: "a", project_id: "p1" }, { id: "done", project_id: "p1" }, { id: "dropped", project_id: "p1" }],
      (id) => history[id] ?? null,
      [openPr("pr-1", 1, "p1")],
      (id) => (history[id] ? [history[id].prId] : []),
    );
    expect(links.options.map((pr) => pr.prNumber)).toEqual([1]);
    expect(links.targets("pr-1")).toEqual(["a", "done", "dropped"]);
    // The past links can still be removed.
    expect(links.unlinkable.map((link) => link.issueId)).toEqual(["done", "dropped"]);
  });

  it("links only the tickets without a live pull request in a mixed selection", () => {
    const links = bulkPullRequestLinks(
      [{ id: "linked", project_id: "p1" }, { id: "free", project_id: "p1" }],
      prOf,
      [openPr("pr-447", 447, "p1"), openPr("pr-1", 1, "p1")],
    );
    expect(links.options.map((pr) => pr.prNumber)).toEqual([447, 1]);
    expect(links.targets("pr-1")).toEqual(["free"]);
  });

  it("offers no pull request once every selected ticket holds a live one", () => {
    const links = bulkPullRequestLinks(
      [{ id: "linked", project_id: "p1" }],
      prOf,
      [openPr("pr-447", 447, "p1"), openPr("pr-1", 1, "p1")],
    );
    expect(links.options).toEqual([]);
  });

  it("leaves out a pull request whose project has no ticket free to take it", () => {
    const links = bulkPullRequestLinks(
      [{ id: "linked", project_id: "p1" }, { id: "free", project_id: "p2" }],
      prOf,
      [openPr("pr-1", 1, "p1"), openPr("pr-2", 2, "p2")],
    );
    expect(links.options.map((pr) => pr.prNumber)).toEqual([2]);
  });

  it("lists every link of every selected ticket for unlinking", () => {
    const links = bulkPullRequestLinks(
      [{ id: "linked", project_id: "p1" }, { id: "free", project_id: "p1" }],
      prOf,
      [],
      (id) => (id === "linked" ? ["pr-447", "pr-12"] : []),
    );
    expect(links.unlinkable).toEqual([{ issueId: "linked", prIds: ["pr-447", "pr-12"] }]);
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

  it("leaves out a ticket that holds another open pull request", () => {
    const withOther = (id: string) => (id === "busy" ? { prId: "pr-450", prNumber: 450, state: "open" as const } : prOf(id));
    const links = bulkPullRequestLinks(
      [{ id: "linked", project_id: "p1" }, { id: "free", project_id: "p1" }, { id: "busy", project_id: "p1" }],
      withOther,
      [openPr("pr-447", 447, "p1"), openPr("pr-450", 450, "p1")],
    );
    expect(links.targets("pr-447")).toEqual(["free"]);
  });

  it("offers nothing to extend when every ticket of the project already has the pull request", () => {
    const links = bulkPullRequestLinks([{ id: "linked", project_id: "p1" }], prOf, [openPr("pr-447", 447, "p1")]);
    expect(links.partial).toEqual([]);
  });
});
