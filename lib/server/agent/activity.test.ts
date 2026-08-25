import { describe, expect, it } from "vitest";
import {
  buildAgentActivity,
  issuePullRequestsForBindings,
  type AgentRunRow,
  type IssuePrRow,
  type ScopedIssuePrRow,
} from "./activity";

/**
 * Semantics of activity by outcome (CONVERSATIONAL model). The sensitive point:
 * `session` means “a CONVERSATION exists” (at work OR at rest) — it is
 * which decides whether the card proposes to OPEN the conversation or START a new one. If it regresses, an issue whose session is idle would fall back to
 * a blank composer instead of continuing its conversation. `working` remains,
 * strictly queued/running (animated halo, only one agent at work per ticket).
 * NB: calling endpoints already exclude `failed` runs from rows.
 */

function row(over: Partial<AgentRunRow> & { status: string }): AgentRunRow {
  return {
    issue_id: "issue-1",
    id: "run-1",
    pr_number: null,
    pr_state: null,
    created_at: "2026-07-15T10:00:00Z",
    ...over,
  };
}

describe("buildAgentActivity", () => {
  it("une session au repos (completed) reste une conversation ouvrable", () => {
    const out = buildAgentActivity([row({ status: "completed" })]);
    expect(out.sessionIssueIds).toEqual(["issue-1"]);
    expect(out.workingIssueIds).toEqual([]);
  });

  it("compte les sessions au travail comme au repos", () => {
    for (const status of ["queued", "running", "completed", "canceled"]) {
      const out = buildAgentActivity([row({ status })]);
      expect(out.sessionIssueIds, status).toEqual(["issue-1"]);
    }
  });

  it("ne signale « travaille » que pour queued/running", () => {
    expect(buildAgentActivity([row({ status: "completed" })]).workingIssueIds).toEqual([]);
    expect(buildAgentActivity([row({ status: "canceled" })]).workingIssueIds).toEqual([]);
    expect(buildAgentActivity([row({ status: "queued" })]).workingIssueIds).toEqual(["issue-1"]);
    expect(buildAgentActivity([row({ status: "running" })]).workingIssueIds).toEqual(["issue-1"]);
  });

  it("une run active plus ancienne fait travailler l'issue même sous une run terminée", () => {
    // Real case: several successive runs, sorted created_at DESC by the caller.
    const out = buildAgentActivity([
      row({ id: "run-2", status: "completed", created_at: "2026-07-15T12:00:00Z" }),
      row({ id: "run-1", status: "running" }),
    ]);
    expect(out.sessionIssueIds).toEqual(["issue-1"]);
    expect(out.workingIssueIds).toEqual(["issue-1"]);
  });

  it("dédoublonne les sessions par issue", () => {
    const out = buildAgentActivity([
      row({ issue_id: "issue-A", id: "a1", status: "running" }),
      row({ issue_id: "issue-B", id: "b1", status: "completed" }),
    ]);
    expect(out.workingIssueIds).toEqual(["issue-A"]);
    expect(out.sessionIssueIds).toEqual(["issue-A", "issue-B"]);
  });
});

/**
 * The PR of a ticket is NO LONGER read on the runs (MIN-163): a human PR, or
 * a PR attached to the hand, has no runs — the ticket then said "no
 * pull request" even though it had one. It comes from `pull_requests`, and
 * ALL its states count: "See pull request" must lead to a closed PR
 * as well as to an open PR. It is the chip of the card which removes `closed`,
 * with the `state` which is returned here.
 */
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

describe("pullRequests", () => {
  it("expose la PR du ticket, sans qu'aucun run ne la porte", () => {
    // The missing case: human PR (or attached to the hand), zero runs.
    const out = buildAgentActivity([], [prRow()]);
    expect(out.sessionIssueIds).toEqual([]);
    expect(out.pullRequests["issue-1"]).toEqual({
      prId: "pr-1",
      prNumber: 7,
      state: "open",
    });
  });

  it("expose aussi une PR FERMÉE — le lien y mène quel que soit l'état", () => {
    const out = buildAgentActivity([], [prRow({ state: "closed" })]);
    expect(out.pullRequests["issue-1"]?.state).toBe("closed");
  });

  it("une PR VIVANTE l'emporte sur une PR terminale plus récente", () => {
    // Real case: the closed PR has just been affected (a comment), the one we
    // wants to reread is the open. Freshness must not win against it.
    const out = buildAgentActivity(
      [],
      [
        prRow({ id: "pr-closed", number: 9, state: "closed", updated_at: "2026-07-16T10:00:00Z" }),
        prRow({ id: "pr-open", number: 8, state: "open", updated_at: "2026-07-15T10:00:00Z" }),
      ],
    );
    expect(out.pullRequests["issue-1"]?.prId).toBe("pr-open");
  });

  it("à défaut de PR vivante, la plus récemment touchée gagne", () => {
    const out = buildAgentActivity(
      [],
      [
        prRow({ id: "pr-recent", number: 9, state: "merged", updated_at: "2026-07-16T10:00:00Z" }),
        prRow({ id: "pr-old", number: 8, state: "closed", updated_at: "2026-07-15T10:00:00Z" }),
      ],
    );
    expect(out.pullRequests["issue-1"]?.prId).toBe("pr-recent");
  });

  it("une PR sans ticket n'entre nulle part", () => {
    expect(buildAgentActivity([], [prRow({ issue_id: null })]).pullRequests).toEqual({});
  });

  it("chaque ticket a sa PR", () => {
    const out = buildAgentActivity(
      [],
      [
        prRow({ id: "pr-a", issue_id: "issue-A", number: 1 }),
        prRow({ id: "pr-b", issue_id: "issue-B", number: 2, state: "merged" }),
      ],
    );
    expect(out.pullRequests).toEqual({
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
