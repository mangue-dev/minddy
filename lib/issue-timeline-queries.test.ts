import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { commentsKey, issueCommentsOptions, issueEventsOptions } from "./issue-timeline-queries";
import type { Comment } from "./types";

const api = vi.hoisted(() => ({ comments: vi.fn(), events: vi.fn() }));
vi.mock("./comments-api", () => ({ fetchCommentsApi: api.comments, fetchEventsApi: api.events }));
afterEach(() => { vi.clearAllMocks(); });
const client = () => new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
const original = { id: "comment-1", issue_id: "issue-1", body: "Old body", parent_id: null, updated_at: "2026-10-03T11:00:00Z" } as Comment;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("timeline activation freshness", () => {
  it("reconciles a recent cache on each observer activation after hidden remote edits and deletes", async () => {
    const cache = client(); const key = commentsKey("issue-1");
    cache.setQueryData(key, [original]);
    const fresh = { ...original, body: "Remote edit", updated_at: "2026-10-03T11:01:00Z" };
    api.comments.mockResolvedValueOnce([fresh]).mockResolvedValueOnce([]);
    const options = issueCommentsOptions(cache, "issue-1");
    const observer = new QueryObserver(cache, options);
    let stop = observer.subscribe(() => {}); await tick();
    expect(cache.getQueryData(key)).toEqual([fresh]); stop();
    // Five-minute staleTime still says fresh; remount must perform the read anyway.
    stop = observer.subscribe(() => {}); await tick();
    expect(api.comments).toHaveBeenCalledTimes(2); expect(cache.getQueryData(key)).toEqual([]);
    stop(); cache.clear();
  });

  it("keeps unsent/failed UUIDs while authoritative reactivation deduplicates remote echoes", async () => {
    const cache = client();
    const pending = { ...original, id: "draft-1", body: "Retained draft", delivery: { state: "error" as const, retry: vi.fn(), discard: vi.fn() } };
    cache.setQueryData(commentsKey("issue-1"), [original, pending]); api.comments.mockResolvedValue([original]);
    const observer = new QueryObserver(cache, issueCommentsOptions(cache, "issue-1")); const stop = observer.subscribe(() => {}); await tick();
    expect(cache.getQueryData(commentsKey("issue-1"))).toEqual([original, pending]); stop();
    api.comments.mockResolvedValue([original, { ...pending, delivery: undefined }]); const again = observer.subscribe(() => {}); await tick();
    expect(cache.getQueryData<Comment[]>(commentsKey("issue-1"))?.filter((c) => c.id === pending.id)).toHaveLength(1);
    expect(cache.getQueryData<Comment[]>(commentsKey("issue-1"))?.find((c) => c.id === pending.id)?.delivery).toBeUndefined();
    again(); cache.clear();
  });

  it("surfaces authorization errors and never replaces rejected reads with a successful empty list", async () => {
    const cache = client(); cache.setQueryData(commentsKey("issue-1"), [original]);
    api.comments.mockRejectedValue(new Error("Authorization unavailable"));
    const observer = new QueryObserver(cache, issueCommentsOptions(cache, "issue-1")); const stop = observer.subscribe(() => {}); await tick();
    expect(observer.getCurrentResult().isError).toBe(true); expect(observer.getCurrentResult().error?.message).toBe("Authorization unavailable");
    expect(cache.getQueryData(commentsKey("issue-1"))).toEqual([original]); stop(); cache.clear();
  });

  it("refreshes audit events on activation and leaves absent issue IDs disabled", async () => {
    const cache = client(); cache.setQueryData(["events", "issue-1"], []); api.events.mockResolvedValue([{ id: "new-event" }]);
    const observer = new QueryObserver(cache, issueEventsOptions("issue-1")); const stop = observer.subscribe(() => {}); await tick();
    expect(api.events).toHaveBeenCalledWith("issue-1"); expect(cache.getQueryData(["events", "issue-1"])).toEqual([{ id: "new-event" }]);
    expect(issueEventsOptions(null).enabled).toBe(false); expect(issueCommentsOptions(cache, null).enabled).toBe(false); stop(); cache.clear();
  });
});
