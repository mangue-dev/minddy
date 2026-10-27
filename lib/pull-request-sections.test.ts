import { describe, expect, it } from "vitest";
import { DEFAULT_PULL_REQUEST_SECTIONS, firstDisplayedOpenPullRequestIds, groupPullRequestsBySection, pullRequestSection } from "./pull-request-sections";
import type { PullRequestListItem } from "./agent-api";

const pr = (id: string, state: PullRequestListItem["pr_state"], createdByMe = false, reviewRequestedForMe = false) =>
  ({ prId: id, pr_state: state, createdByMe, reviewRequestedForMe }) as PullRequestListItem;

describe("pull request sidebar sections", () => {
  it("includes active queues by default and hides completed PRs", () => {
    expect(DEFAULT_PULL_REQUEST_SECTIONS).toEqual(["created", "review", "team"]);
    expect(DEFAULT_PULL_REQUEST_SECTIONS).not.toContain("completed");
  });

  it("groups across projects in fixed section order without duplicating a PR", () => {
    const team = pr("team", "open");
    const requested = pr("review", "open", false, true);
    const mine = pr("mine", "draft", true, true);
    const merged = pr("merged", "merged", true, true);
    const closed = pr("closed", "closed", false, true);
    const all = new Set(["created", "review", "team", "completed"]);
    expect(groupPullRequestsBySection([merged, team, requested, mine, closed], all)).toEqual([
      { key: "created", items: [mine] }, { key: "review", items: [requested] },
      { key: "team", items: [team] }, { key: "completed", items: [merged, closed] },
    ]);
  });

  it("moves a PR out of a review queue immediately after closing or merging", () => {
    const requested = pr("review", "open", false, true);
    expect(pullRequestSection(requested)).toBe("review");
    expect(pullRequestSection({ ...requested, pr_state: "closed" })).toBe("completed");
    expect(pullRequestSection({ ...requested, pr_state: "merged" })).toBe("completed");
    expect(pullRequestSection({ ...requested, pr_state: "draft" })).toBe("review");
  });

  it("keeps PRs visible in the team queue when the personal forge identity is unavailable", () => {
    expect(pullRequestSection({ pr_state: "open" })).toBe("team");
  });

  it("returns exactly the checked sections, empty ones included (MIN-817)", () => {
    const merged = pr("merged", "merged", true);
    const team = pr("team", "open");
    expect(groupPullRequestsBySection([merged, team], new Set(DEFAULT_PULL_REQUEST_SECTIONS))).toEqual([
      { key: "created", items: [] }, { key: "review", items: [] }, { key: "team", items: [team] },
    ]);
    expect(groupPullRequestsBySection([merged], new Set(["completed", "created"]))).toEqual([
      { key: "created", items: [] }, { key: "completed", items: [merged] },
    ]);
    expect(groupPullRequestsBySection([merged, team], new Set())).toEqual([]);
  });
});

describe("firstDisplayedOpenPullRequestIds (MIN-817)", () => {
  it("prepares the open PRs in display order, section by section", () => {
    const rows = [
      pr("team-1", "open"), pr("team-2", "open"), pr("merged", "merged", true),
      pr("review", "open", false, true), pr("mine", "draft", true),
    ];
    expect(firstDisplayedOpenPullRequestIds(rows, 3)).toEqual(["mine", "review", "team-1"]);
  });
});
