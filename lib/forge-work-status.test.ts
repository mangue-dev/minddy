import { describe, expect, it } from "vitest";

import {
  forgeWorkStatus,
  resolveForgeWorkStatus,
  type ForgeWork,
  type LinkedCommitWork,
  type LinkedPullRequestWork,
} from "./forge-work-status";

const NONE: ForgeWork = { pullRequests: [], commits: [], branchPushed: false };

function pr(
  state: LinkedPullRequestWork["state"],
  openedAt = "2026-11-01T10:00:00Z",
  mergedAt: string | null = null,
): LinkedPullRequestWork {
  return { state, openedAt, mergedAt };
}

function commit(overrides: Partial<LinkedCommitWork> = {}): LinkedCommitWork {
  return {
    closes: false,
    onDefaultBranch: false,
    committedAt: "2026-11-10T10:00:00Z",
    inPullRequest: false,
    ...overrides,
  };
}

describe("forgeWorkStatus", () => {
  it("follows the table, strongest work first", () => {
    expect(forgeWorkStatus(NONE)).toBeNull();
    expect(forgeWorkStatus({ ...NONE, pullRequests: [pr("closed")] })).toBe("todo");
    expect(forgeWorkStatus({ ...NONE, branchPushed: true })).toBe("in_progress");
    expect(forgeWorkStatus({ ...NONE, commits: [commit()] })).toBe("in_progress");
    expect(forgeWorkStatus({ ...NONE, pullRequests: [pr("draft"), pr("closed")] }))
      .toBe("in_progress");
    expect(forgeWorkStatus({ ...NONE, pullRequests: [pr("open")], commits: [commit()] }))
      .toBe("in_review");
    expect(forgeWorkStatus({
      ...NONE,
      pullRequests: [pr("open"), pr("merged", "2026-10-01T10:00:00Z", "2026-10-02T10:00:00Z")],
    })).toBe("done");
    expect(forgeWorkStatus({
      ...NONE,
      pullRequests: [pr("open")],
      commits: [commit({ closes: true, onDefaultBranch: true })],
    })).toBe("done");
  });

  it("does not deliver on a closing commit that never reached the default branch", () => {
    expect(forgeWorkStatus({ ...NONE, commits: [commit({ closes: true })] })).toBe("in_progress");
  });

  it("lets a pull request speak for the commits it carries", () => {
    expect(forgeWorkStatus({
      ...NONE,
      pullRequests: [pr("closed")],
      commits: [commit({ inPullRequest: true })],
    })).toBe("todo");
  });
});

describe("resolveForgeWorkStatus — commits and branches", () => {
  it("starts an issue on a commit that names it, from any waiting status", () => {
    for (const current of ["triage", "backlog", "todo"] as const) {
      expect(resolveForgeWorkStatus({
        current,
        signal: { kind: "commits", closesOnDefaultBranch: false },
        work: { ...NONE, commits: [commit()] },
      })).toBe("in_progress");
    }
  });

  it("starts an issue on a pushed branch named after it", () => {
    expect(resolveForgeWorkStatus({
      current: "backlog", signal: { kind: "branch" }, work: { ...NONE, branchPushed: true },
    })).toBe("in_progress");
  });

  it("completes an issue on a closing commit that reaches the default branch", () => {
    for (const current of ["todo", "in_progress", "in_review"] as const) {
      expect(resolveForgeWorkStatus({
        current,
        signal: { kind: "commits", closesOnDefaultBranch: true },
        work: { ...NONE, commits: [commit({ closes: true, onDefaultBranch: true })] },
      })).toBe("done");
    }
  });

  it("never moves an issue back, and never out of a closed status", () => {
    const work = { ...NONE, commits: [commit()] };
    for (const current of ["in_progress", "in_review", "done", "canceled", "duplicate"] as const) {
      expect(resolveForgeWorkStatus({
        current, signal: { kind: "commits", closesOnDefaultBranch: false }, work,
      })).toBeNull();
      expect(resolveForgeWorkStatus({ current, signal: { kind: "branch" }, work })).toBeNull();
    }
    expect(resolveForgeWorkStatus({
      current: "canceled", signal: { kind: "commits", closesOnDefaultBranch: true }, work,
    })).toBeNull();
  });

  it("leaves the issue to its live pull request, an open one or a draft", () => {
    for (const state of ["open", "draft"] as const) {
      expect(resolveForgeWorkStatus({
        // Put back to "to do" by hand while its pull request is open.
        current: "todo",
        signal: { kind: "commits", closesOnDefaultBranch: false },
        work: { ...NONE, pullRequests: [pr(state)], commits: [commit()] },
      })).toBeNull();
    }
  });

  it("does not complete an issue reopened by hand on a plain follow-up commit", () => {
    expect(resolveForgeWorkStatus({
      current: "todo",
      signal: { kind: "commits", closesOnDefaultBranch: false },
      work: {
        ...NONE,
        commits: [
          commit({ closes: true, onDefaultBranch: true, committedAt: "2026-11-02T10:00:00Z" }),
          commit({ onDefaultBranch: true, committedAt: "2026-11-20T10:00:00Z" }),
        ],
      },
    })).toBe("in_progress");
  });
});

describe("resolveForgeWorkStatus — pull requests", () => {
  it("keeps the historical effect of each state", () => {
    const cases = [
      ["open", "in_review"], ["draft", "in_progress"], ["merged", "done"], ["closed", "todo"],
    ] as const;
    for (const [state, expected] of cases) {
      expect(resolveForgeWorkStatus({
        current: "backlog",
        signal: { kind: "pull_request", state, openedAt: "2026-11-01T10:00:00Z" },
        work: { ...NONE, pullRequests: [pr(state)] },
      })).toBe(expected);
    }
  });

  it("writes nothing when the issue already has the status", () => {
    expect(resolveForgeWorkStatus({
      current: "in_review",
      signal: { kind: "pull_request", state: "open" },
      work: { ...NONE, pullRequests: [pr("open")] },
    })).toBeNull();
  });

  it("keeps an issue done when its pull request closes after a direct commit delivered it", () => {
    expect(resolveForgeWorkStatus({
      current: "done",
      signal: { kind: "pull_request", state: "closed", openedAt: "2026-11-01T10:00:00Z" },
      work: {
        ...NONE,
        pullRequests: [pr("closed")],
        commits: [commit({ closes: true, onDefaultBranch: true })],
      },
    })).toBeNull();
    // Even put back by hand in between: the delivery happened while it lived.
    expect(resolveForgeWorkStatus({
      current: "in_review",
      signal: { kind: "pull_request", state: "closed", openedAt: "2026-11-01T10:00:00Z" },
      work: {
        ...NONE,
        pullRequests: [pr("closed")],
        commits: [commit({ closes: true, onDefaultBranch: true })],
      },
    })).toBe("done");
  });

  it("returns to \"to do\" when a follow-up pull request closes after an older delivery", () => {
    expect(resolveForgeWorkStatus({
      current: "in_review",
      signal: { kind: "pull_request", state: "closed", openedAt: "2026-11-15T10:00:00Z" },
      work: {
        ...NONE,
        pullRequests: [
          pr("merged", "2026-11-01T10:00:00Z", "2026-11-02T10:00:00Z"),
          pr("closed", "2026-11-15T10:00:00Z"),
        ],
      },
    })).toBe("todo");
  });

  it("puts a follow-up pull request in review after an older delivery", () => {
    expect(resolveForgeWorkStatus({
      current: "done",
      signal: { kind: "pull_request", state: "open", openedAt: "2026-11-15T10:00:00Z" },
      work: {
        ...NONE,
        pullRequests: [
          pr("merged", "2026-11-01T10:00:00Z", "2026-11-02T10:00:00Z"),
          pr("open", "2026-11-15T10:00:00Z"),
        ],
      },
    })).toBe("in_review");
  });

  it("keeps a closed pull request's issue on the other work still linked to it", () => {
    const closed = { kind: "pull_request", state: "closed", openedAt: "2026-11-01T10:00:00Z" } as const;
    expect(resolveForgeWorkStatus({
      current: "in_review", signal: closed,
      work: { ...NONE, pullRequests: [pr("closed"), pr("open")] },
    })).toBeNull();
    expect(resolveForgeWorkStatus({
      current: "in_review", signal: closed,
      work: { ...NONE, pullRequests: [pr("closed")], commits: [commit()] },
    })).toBe("in_progress");
    expect(resolveForgeWorkStatus({
      current: "in_review", signal: closed,
      work: { ...NONE, pullRequests: [pr("closed")], branchPushed: true },
    })).toBe("in_progress");
    // Its own commits do not hold it back.
    expect(resolveForgeWorkStatus({
      current: "in_review", signal: closed,
      work: { ...NONE, pullRequests: [pr("closed")], commits: [commit({ inPullRequest: true })] },
    })).toBe("todo");
  });

  it("puts a draft's issue in review when another pull request is open", () => {
    expect(resolveForgeWorkStatus({
      current: "todo",
      signal: { kind: "pull_request", state: "draft" },
      work: { ...NONE, pullRequests: [pr("draft"), pr("open")] },
    })).toBe("in_review");
  });
});

describe("resolveForgeWorkStatus — a squash merge and its push, in both orders", () => {
  const merged = pr("merged", "2026-11-01T10:00:00Z", "2026-11-10T10:00:00Z");
  const squash = commit({ closes: true, onDefaultBranch: true, inPullRequest: true });

  it("completes once when the push arrives first", () => {
    expect(resolveForgeWorkStatus({
      current: "in_review",
      signal: { kind: "commits", closesOnDefaultBranch: true },
      work: { ...NONE, pullRequests: [pr("open")], commits: [commit({ closes: true, onDefaultBranch: true })] },
    })).toBe("done");
    expect(resolveForgeWorkStatus({
      current: "done",
      signal: { kind: "pull_request", state: "merged" },
      work: { ...NONE, pullRequests: [merged], commits: [squash] },
    })).toBeNull();
  });

  it("completes once when the merge arrives first", () => {
    expect(resolveForgeWorkStatus({
      current: "in_review",
      signal: { kind: "pull_request", state: "merged" },
      work: { ...NONE, pullRequests: [merged] },
    })).toBe("done");
    expect(resolveForgeWorkStatus({
      current: "done",
      signal: { kind: "commits", closesOnDefaultBranch: true },
      work: { ...NONE, pullRequests: [merged], commits: [squash] },
    })).toBeNull();
  });
});
