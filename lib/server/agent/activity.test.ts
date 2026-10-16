import { describe, expect, it } from "vitest";
import {
  issuePullRequestsForBindings,
  pickIssuePullRequests,
  type IssuePrRow,
  type ScopedIssuePrRow,
} from "./activity";

function prRow(over: Partial<IssuePrRow> = {}): IssuePrRow {
  return {
    id: "pr-1",
    issue_id: "issue-1",
    number: 7,
    state: "open",
    updated_at: "2026-07-15T10:00:00Z",
    ...over,
  };
}

describe("pickIssuePullRequests", () => {
  it("exposes the PR linked to an issue", () => {
    expect(pickIssuePullRequests([prRow()])["issue-1"]).toEqual({
      prId: "pr-1",
      prNumber: 7,
      state: "open",
    });
  });

  it("also exposes a closed PR so the link remains available", () => {
    const out = pickIssuePullRequests([prRow({ state: "closed" })]);
    expect(out["issue-1"]?.state).toBe("closed");
  });

  it("prefers a live PR over a newer terminal PR", () => {
    // Real case: the closed PR has just been affected (a comment), the one we
    // want to reopen is the live one. Freshness must not win against it.
    const out = pickIssuePullRequests([
        prRow({ id: "pr-closed", number: 9, state: "closed", updated_at: "2026-07-16T10:00:00Z" }),
        prRow({ id: "pr-open", number: 8, state: "open", updated_at: "2026-07-15T10:00:00Z" }),
      ],
    );
    expect(out["issue-1"]?.prId).toBe("pr-open");
  });

  it("uses the most recently updated PR when none are live", () => {
    const out = pickIssuePullRequests([
        prRow({ id: "pr-recent", number: 9, state: "merged", updated_at: "2026-07-16T10:00:00Z" }),
        prRow({ id: "pr-old", number: 8, state: "closed", updated_at: "2026-07-15T10:00:00Z" }),
      ],
    );
    expect(out["issue-1"]?.prId).toBe("pr-recent");
  });

  it("excludes a PR without an issue", () => {
    expect(pickIssuePullRequests([prRow({ issue_id: null })])).toEqual({});
  });

  it("maps each issue to its PR", () => {
    const out = pickIssuePullRequests([
        prRow({ id: "pr-a", issue_id: "issue-A", number: 1 }),
        prRow({ id: "pr-b", issue_id: "issue-B", number: 2, state: "merged" }),
      ],
    );
    expect(out).toEqual({
      "issue-A": { prId: "pr-a", prNumber: 1, state: "open" },
      "issue-B": { prId: "pr-b", prNumber: 2, state: "merged" },
    });
  });
});

describe("global activity repository scope", () => {
  it("requires the issue project and repository to match the same authorized link", () => {
    const rows: ScopedIssuePrRow[] = [
      {
        ...prRow({ id: "allowed", issue_id: "issue-a" }),
        provider: "github",
        repo_full_name: "acme/app",
        issue: { project_id: "project-a" },
      },
      {
        ...prRow({ id: "cross-project", issue_id: "issue-b" }),
        provider: "github",
        repo_full_name: "acme/app",
        issue: { project_id: "project-b" },
      },
      {
        ...prRow({ id: "wrong-repo", issue_id: "issue-a" }),
        provider: "github",
        repo_full_name: "acme/other",
        issue: { project_id: "project-a" },
      },
    ];
    expect(
      issuePullRequestsForBindings(rows, [
        { project_id: "project-a", provider: "github", repo_full_name: "acme/app" },
      ]).map((row) => row.id),
    ).toEqual(["allowed"]);
  });
});
