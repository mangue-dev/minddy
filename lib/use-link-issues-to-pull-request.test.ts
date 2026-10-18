import { describe, expect, it, vi } from "vitest";

vi.mock("mangue-ui", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { linkIssuesToPullRequest } from "./use-link-issues-to-pull-request";

describe("linkIssuesToPullRequest", () => {
  it("links each issue on its own, so one refusal never blocks the others", async () => {
    const link = vi.fn(async (_prId: string, issueId: string) => {
      if (issueId === "busy") throw new Error("This issue already has a pull request.");
      return { ok: true as const, issue: { id: issueId, number: 1, title: "" }, status: null };
    });
    const outcome = await linkIssuesToPullRequest(
      ["a", "busy", "b"],
      { prId: "pr", prNumber: 447, state: "open" },
      link,
    );
    expect(link).toHaveBeenCalledTimes(3);
    expect(outcome.linked).toEqual(["a", "b"]);
    expect(outcome.failed).toEqual([{ issueId: "busy", message: "This issue already has a pull request." }]);
  });
});
