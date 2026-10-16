import { describe, expect, it } from "vitest";
import type { AgentRunPrResponse } from "./agent-api";
import type { PullRequestReadiness, ReadinessBlocker } from "./pr-readiness";
import { prMenuCanMerge, prMenuNeedsFix, prMenuStateTargets } from "./pr-context-menu";

const readiness = (overrides: Partial<PullRequestReadiness> = {}): PullRequestReadiness => ({
  state: "ready",
  blockers: [],
  passed: [],
  mergeAllowed: true,
  methods: ["squash"],
  preferredMethod: "squash",
  ...overrides,
} as PullRequestReadiness);

const blocker = (kind: ReadinessBlocker["kind"]): ReadinessBlocker =>
  ({ id: kind, kind, required: true, status: "blocked", source: "pull_request" }) as ReadinessBlocker;

describe("prMenuStateTargets", () => {
  it("offers only the transitions that exist from each state", () => {
    expect(prMenuStateTargets("open")).toEqual(["draft", "closed"]);
    expect(prMenuStateTargets("draft")).toEqual(["open", "closed"]);
    expect(prMenuStateTargets("closed")).toEqual(["open"]);
    expect(prMenuStateTargets("merged")).toEqual([]);
  });
});

describe("prMenuCanMerge", () => {
  it("allows an open, non-draft pull request whose readiness allows a method", () => {
    expect(prMenuCanMerge("open", false, readiness())).toBe(true);
  });

  it("refuses drafts, other states, unknown readiness, blocked readiness and missing methods", () => {
    expect(prMenuCanMerge("open", true, readiness())).toBe(false);
    expect(prMenuCanMerge("draft", false, readiness())).toBe(false);
    expect(prMenuCanMerge("closed", false, readiness())).toBe(false);
    expect(prMenuCanMerge("open", false, null)).toBe(false);
    expect(prMenuCanMerge("open", false, readiness({ mergeAllowed: false }))).toBe(false);
    expect(prMenuCanMerge("open", false, readiness({ methods: [] }))).toBe(false);
  });
});

describe("prMenuNeedsFix", () => {
  const data = (overrides: Partial<AgentRunPrResponse> = {}) =>
    ({ checks: null, readiness: readiness(), ...overrides }) as AgentRunPrResponse;

  it("is false for a clean pull request", () => {
    expect(prMenuNeedsFix(data(), 0)).toBe(false);
  });

  it("is true for a failing check, an unresolved conversation, a conflict or an out-of-date branch", () => {
    const failing = { checks: [{ state: "failure" }] } as unknown as AgentRunPrResponse["checks"];
    expect(prMenuNeedsFix(data({ checks: failing }), 0)).toBe(true);
    expect(prMenuNeedsFix(data(), 1)).toBe(true);
    expect(prMenuNeedsFix(data({ readiness: readiness({ blockers: [blocker("conflicts")] }) }), 0)).toBe(true);
    expect(prMenuNeedsFix(data({ readiness: readiness({ blockers: [blocker("branch")] }) }), 0)).toBe(true);
  });

  it("ignores a pending check and an approval blocker", () => {
    const pending = { checks: [{ state: "pending" }] } as unknown as AgentRunPrResponse["checks"];
    expect(prMenuNeedsFix(data({ checks: pending, readiness: readiness({ blockers: [blocker("approvals")] }) }), 0)).toBe(false);
  });
});
