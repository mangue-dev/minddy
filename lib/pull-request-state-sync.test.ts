import { describe, expect, it } from "vitest";
import type { AgentRunPrResponse, PullRequestListItem } from "./agent-api";
import { pullRequestStatesToReconcile } from "./pull-request-state-sync";

const row = (prId: string, pr_state: PullRequestListItem["pr_state"] = "open") =>
  ({ prId, pr_state, updated_at: "2026-10-27T10:00:00Z" }) as PullRequestListItem;
const merged = { state: "closed", merged: true, draft: false, updatedAt: "2026-10-27T10:05:00Z" } as AgentRunPrResponse["pr"];
const readiness = (state: string) => ({ state }) as NonNullable<AgentRunPrResponse["readiness"]>;
const none = { detail: () => undefined, readinessByPrId: {}, notBefore: () => 0 };

describe("pullRequestStatesToReconcile (MIN-817)", () => {
  it("writes a newer detail state into the list row", () => {
    expect(pullRequestStatesToReconcile([row("a")], {
      ...none, detail: () => ({ pr: merged, fetchedAt: 2_000 }),
    })).toEqual([{ prId: "a", state: "merged" }]);
  });

  it("ignores a detail read received before the page's own write", () => {
    expect(pullRequestStatesToReconcile([row("a")], {
      ...none, detail: () => ({ pr: merged, fetchedAt: 1_000 }), notBefore: () => 2_000,
    })).toEqual([]);
  });

  it("ignores a detail older than the row", () => {
    expect(pullRequestStatesToReconcile([row("a")], {
      ...none, detail: () => ({ pr: { ...merged!, updatedAt: "2026-10-27T09:00:00Z" }, fetchedAt: 2_000 }),
    })).toEqual([]);
  });

  it("takes a merge from readiness, but never a close it cannot date", () => {
    expect(pullRequestStatesToReconcile([row("a"), row("b"), row("c", "merged")], {
      ...none, readinessByPrId: { a: readiness("merged"), b: readiness("closed"), c: readiness("merged") },
    })).toEqual([{ prId: "a", state: "merged" }]);
  });
});
