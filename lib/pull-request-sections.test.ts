import { describe, expect, it } from "vitest";
import { DEFAULT_PULL_REQUEST_SECTIONS, groupPullRequestsBySection, pullRequestSection } from "./pull-request-sections";
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
    expect(groupPullRequestsBySection([merged, team, requested, mine, closed])).toEqual([
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
    expect(groupPullRequestsBySection([])).toEqual([]);
  });
});
