import { describe, expect, it, vi } from "vitest";
import { createIssuePrStore } from "./issue-pr-store";
import type { PullRequestReadiness } from "./pr-readiness";

const readiness = (state: PullRequestReadiness["state"]) =>
  ({ state, blockers: [], passed: [], mergeAllowed: state === "ready", methods: [], preferredMethod: null }) as PullRequestReadiness;

describe("issue PR store readiness", () => {
  it("serves each issue its PR's readiness and notifies only the issues whose verdict moved", () => {
    const store = createIssuePrStore({ pullRequests: {
      a: { prId: "pr-1", prNumber: 1, state: "open" },
      b: { prId: "pr-2", prNumber: 2, state: "open" },
    } });
    const onA = vi.fn();
    const onB = vi.fn();
    store.subscribe("a", onA);
    store.subscribe("b", onB);

    store.updateReadiness({ "pr-1": readiness("checks_failing"), "pr-2": readiness("ready") }, new Set());
    expect(store.getReadiness("a")?.readiness?.state).toBe("checks_failing");
    expect(onA).toHaveBeenCalledTimes(1);
    expect(onB).toHaveBeenCalledTimes(1);

    // Same verdicts: nobody re-renders. A new verdict on pr-1 only reaches "a".
    store.updateReadiness({ "pr-1": readiness("checks_failing"), "pr-2": readiness("ready") }, new Set());
    store.updateReadiness({ "pr-1": readiness("ready"), "pr-2": readiness("ready") }, new Set());
    expect(onA).toHaveBeenCalledTimes(2);
    expect(onB).toHaveBeenCalledTimes(1);

    store.updateReadiness({}, new Set(["pr-2"]));
    expect(store.getReadiness("b")).toEqual({ readiness: null, unavailable: true, flow: null });
    expect(store.getReadiness("a")).toBeNull();
  });

  it("notifies when only the auto-merge state of a PR moves", () => {
    const store = createIssuePrStore({ pullRequests: { a: { prId: "pr-1", prNumber: 1, state: "open" } } });
    const onA = vi.fn();
    store.subscribe("a", onA);
    const flow = (active: boolean) => ({ "pr-1": { active, autoMergeAllowed: true, canWrite: true } });

    store.updateReadiness({ "pr-1": readiness("checks_running") }, new Set(), flow(false));
    store.updateReadiness({ "pr-1": readiness("checks_running") }, new Set(), flow(false));
    expect(onA).toHaveBeenCalledTimes(1);

    store.updateReadiness({ "pr-1": readiness("checks_running") }, new Set(), flow(true));
    expect(onA).toHaveBeenCalledTimes(2);
    expect(store.getReadiness("a")?.flow?.active).toBe(true);
  });
});
