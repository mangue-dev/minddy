import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setCommentReactionState, type ReviewCommentReaction } from "../pr-review-reactions";
import { applyPendingPrReactions, commentReactionsKey, setPrReactionOptimistically } from "./pr-reaction-writes";

const key = commentReactionsKey("/api/pull-requests/pr", "review");
const actors = [{ login: "reviewer[bot]", createdAt: "2026-10-02T00:00:00Z" }];
const reaction: ReviewCommentReaction = { commentId: 1, content: "+1", count: 2, mine: false, reviewerActors: actors };
let client: QueryClient;
beforeEach(() => { client = new QueryClient(); vi.spyOn(Date, "now").mockReturnValue(10); });
afterEach(() => { client.clear(); vi.restoreAllMocks(); });

describe("viewer reaction state", () => {
  it("changes only the viewer's contribution and remains idempotent", () => {
    const added = setCommentReactionState([reaction], 1, "+1", true);
    expect(added).toEqual([{ ...reaction, count: 3, mine: true }]);
    expect(setCommentReactionState(added, 1, "+1", true)).toBe(added);
    const removed = setCommentReactionState(added, 1, "+1", false);
    expect(removed).toEqual([reaction]);
    expect(setCommentReactionState(removed, 1, "+1", false)).toBe(removed);
  });

  it("hides the final removed reaction without producing negative counts", () => {
    expect(setCommentReactionState([{ ...reaction, mine: true, count: 1 }], 1, "+1", false)).toEqual([]);
    expect(setCommentReactionState([{ ...reaction, mine: true, count: 0 }], 1, "+1", false)).toEqual([]);
    expect(setCommentReactionState([], 1, "+1", false)).toEqual([]);
  });
});

describe("PR reaction write protection", () => {
  it("reapplies confirmed writes to older reads, preserves payload fields and accepts newer reads", async () => {
    const data = { comments: ["comment"], threads: ["thread"], reactions: [reaction] };
    client.setQueryData(key, data);
    await setPrReactionOptimistically(client, key, { commentId: 1, content: "+1", on: true }, () => Promise.resolve({ on: true }));
    expect(applyPendingPrReactions(client, key, data, 0)).toEqual({ ...data, reactions: [{ ...reaction, count: 3, mine: true }] });
    expect(applyPendingPrReactions(client, key, data, 11)).toBe(data);
    const echoed = { ...data, reactions: [{ ...reaction, count: 3, mine: true }] };
    expect(applyPendingPrReactions(client, key, echoed, 0)).toBe(echoed);
    expect(applyPendingPrReactions(client, commentReactionsKey("/api/pull-requests/other", "review"), data, 0)).toBe(data);
    expect(applyPendingPrReactions(client, commentReactionsKey("/api/pull-requests/pr", "conversation"), data, 0)).toBe(data);
    const otherClient = new QueryClient();
    expect(applyPendingPrReactions(otherClient, key, data, 0)).toBe(data);
    otherClient.clear();
  });

  it("restores a failed final removal, including metadata and unrelated payload data", async () => {
    const before = { ...reaction, mine: true, count: 1 };
    const data = { comments: ["comment"], threads: ["thread"], reactions: [before] };
    client.setQueryData(key, data);
    let reject!: (error: Error) => void;
    const result = setPrReactionOptimistically(client, key, { commentId: 1, content: "+1", on: false }, () => new Promise((_resolve, rej) => { reject = rej; }));
    expect(client.getQueryData(key)).toEqual({ ...data, reactions: [] });
    const rejected = expect(result).rejects.toThrow("Failed");
    reject(new Error("Failed"));
    await rejected;
    expect(client.getQueryData(key)).toEqual(data);
    expect(applyPendingPrReactions(client, key, data, 0)).toBe(data);
  });

  it("reconciles the desired state actually returned by the forge", async () => {
    client.setQueryData(key, { reactions: [reaction] });
    await setPrReactionOptimistically(client, key, { commentId: 1, content: "+1", on: true }, () => Promise.resolve({ on: false }));
    expect(client.getQueryData(key)).toEqual({ reactions: [reaction] });
    expect(applyPendingPrReactions(client, key, { reactions: [reaction] }, 0)).toEqual({ reactions: [reaction] });
  });
});
