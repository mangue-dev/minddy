// @vitest-environment jsdom

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCommentReactions } from "./use-comment-reactions";
import { usePrCommentsQuery, usePrReviewCommentsQuery } from "./use-agent-runs";
import { commentReactionsKey, type ReactionSurface } from "./optimistic/pr-reaction-writes";
import type { ReviewCommentReaction } from "./pr-review-reactions";

const mocks = vi.hoisted(() => ({ review: vi.fn(), conversation: vi.fn(), fetchReview: vi.fn(), fetchConversation: vi.fn(), changed: vi.fn(), error: vi.fn() }));
vi.mock("./agent-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./agent-api")>(),
  setPrReviewCommentReactionApi: (...args: unknown[]) => mocks.review(...args),
  setPrCommentReactionApi: (...args: unknown[]) => mocks.conversation(...args),
  fetchPrReviewCommentsApi: (...args: unknown[]) => mocks.fetchReview(...args),
  fetchPullRequestCommentsApi: (...args: unknown[]) => mocks.fetchConversation(...args),
}));
vi.mock("mangue-ui", () => ({ toast: { error: (...args: unknown[]) => mocks.error(...args) } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const endpoint = "/api/pull-requests/pr";
const initial: ReviewCommentReaction = { commentId: 1, content: "+1", count: 2, mine: false, reviewerActors: [{ login: "reviewer[bot]", createdAt: "2026-10-02T00:00:00Z" }] };
let client: QueryClient;
let root: Root;
let host: HTMLDivElement;
let hook: ReturnType<typeof useCommentReactions>;
let refetch: () => Promise<unknown>;

function Harness({ surface, canReact = true }: { surface: ReactionSurface; canReact?: boolean }) {
  const review = usePrReviewCommentsQuery(surface === "review" ? endpoint : null);
  const conversation = usePrCommentsQuery(surface === "conversation" ? "pr" : null);
  const data = surface === "review" ? review : conversation;
  refetch = data.refetch;
  hook = useCommentReactions(endpoint, mocks.changed, data.reactions, canReact, surface);
  return React.createElement("div", null, [...hook.byComment.values()].flat().map((reaction) => React.createElement("button", {
    key: `${reaction.commentId}:${reaction.content}`,
    "data-comment": reaction.commentId, "data-emoji": reaction.content,
    "aria-pressed": reaction.mine, "aria-disabled": hook.isPending(reaction.commentId, reaction.content),
  }, String(reaction.count))));
}
const key = (surface: ReactionSurface) => commentReactionsKey(endpoint, surface);
const rows = (surface: ReactionSurface) => client.getQueryData<{ reactions: ReviewCommentReaction[] }>(key(surface))!.reactions;
const button = (comment: number, emoji: string) => host.querySelector<HTMLButtonElement>(`[data-comment="${comment}"][data-emoji="${emoji}"]`);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function mount(surface: ReactionSurface, canReact = true) {
  await act(async () => { root.render(React.createElement(QueryClientProvider, { client }, React.createElement(Harness, { surface, canReact }))); });
}

beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
  for (const surface of ["review", "conversation"] as const) {
    client.setQueryData(key(surface), { comments: [], threads: [], timeline: [], reactions: [initial] });
  }
  mocks.changed.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });

describe.each<ReactionSurface>(["review", "conversation"])("optimistic %s reactions", (surface) => {
  it("changes the count and selected state before the forge responds", async () => {
    const request = deferred<{ ok: true; on: boolean }>();
    const post = surface === "review" ? mocks.review : mocks.conversation;
    post.mockReturnValue(request.promise);
    await mount(surface);
    let result!: Promise<void>;
    await act(async () => { result = hook.toggle(1, "+1", true); await flush(); });
    expect(button(1, "+1")?.textContent).toBe("3");
    expect(button(1, "+1")?.getAttribute("aria-pressed")).toBe("true");
    expect(button(1, "+1")?.getAttribute("aria-disabled")).toBe("true");
    expect(rows(surface)[0].reviewerActors).toEqual(initial.reviewerActors);
    expect(post).toHaveBeenCalledWith(endpoint, { commentId: 1, content: "+1", on: true });
    expect(mocks.changed).not.toHaveBeenCalled();
    await act(async () => { request.resolve({ ok: true, on: true }); await result; await flush(); });
    expect(button(1, "+1")?.getAttribute("aria-disabled")).toBe("false");
    expect(mocks.changed).toHaveBeenCalledTimes(1);
  });

  it("adds a first reaction to the PR body and removes it immediately", async () => {
    const post = surface === "review" ? mocks.review : mocks.conversation;
    post.mockResolvedValue({ ok: true, on: true });
    await mount(surface);
    await act(async () => { await hook.toggle(0, "heart", true); await flush(); });
    expect(button(0, "heart")?.textContent).toBe("1");
    const request = deferred<{ ok: true; on: boolean }>();
    post.mockReturnValue(request.promise);
    let result!: Promise<void>;
    await act(async () => { result = hook.toggle(0, "heart", false); await flush(); });
    expect(button(0, "heart")).toBeNull();
    await act(async () => { request.resolve({ ok: true, on: false }); await result; });
    expect(rows(surface)).toEqual([initial]);
  });

  it("rolls back the failed reaction while preserving an independent successful reaction", async () => {
    const failed = deferred<{ on: boolean }>();
    const successful = deferred<{ on: boolean }>();
    const post = surface === "review" ? mocks.review : mocks.conversation;
    post.mockReturnValueOnce(failed.promise).mockReturnValueOnce(successful.promise);
    await mount(surface);
    let first!: Promise<void>;
    let second!: Promise<void>;
    await act(async () => { first = hook.toggle(1, "+1", true); second = hook.toggle(2, "rocket", true); await flush(); });
    await act(async () => { successful.resolve({ on: true }); await second; failed.reject(new Error("Forge failed")); await first; await flush(); });
    expect(button(1, "+1")?.textContent).toBe("2");
    expect(button(1, "+1")?.getAttribute("aria-pressed")).toBe("false");
    expect(button(2, "rocket")?.textContent).toBe("1");
    expect(rows(surface)[0].reviewerActors).toEqual(initial.reviewerActors);
    expect(mocks.error).toHaveBeenCalledWith("Forge failed");
    expect(mocks.changed).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate clicks synchronously and preserves accepted state if refreshing fails", async () => {
    const request = deferred<{ on: boolean }>();
    const post = surface === "review" ? mocks.review : mocks.conversation;
    post.mockReturnValue(request.promise);
    mocks.changed.mockRejectedValue(new Error("Refresh failed"));
    await mount(surface);
    let result!: Promise<void>;
    await act(async () => { result = hook.toggle(1, "+1", true); await hook.toggle(1, "+1", true); await flush(); });
    expect(post).toHaveBeenCalledTimes(1);
    await act(async () => { request.resolve({ on: true }); await result; await flush(); });
    expect(button(1, "+1")?.textContent).toBe("3");
    expect(button(1, "+1")?.getAttribute("aria-pressed")).toBe("true");
    expect(mocks.error).toHaveBeenCalledWith("Refresh failed");
  });

  it("keeps an optimistic reaction when a stale comment refetch returns", async () => {
    const request = deferred<{ on: boolean }>();
    const get = deferred<{ comments: []; threads: []; timeline: []; reactions: ReviewCommentReaction[] }>();
    const post = surface === "review" ? mocks.review : mocks.conversation;
    const fetch = surface === "review" ? mocks.fetchReview : mocks.fetchConversation;
    post.mockReturnValue(request.promise);
    fetch.mockReturnValue(get.promise);
    await mount(surface);
    let result!: Promise<void>;
    let read!: Promise<unknown>;
    await act(async () => { result = hook.toggle(1, "+1", true); read = refetch(); await flush(); });
    await act(async () => { get.resolve({ comments: [], threads: [], timeline: [], reactions: [initial] }); await read; await flush(); });
    expect(button(1, "+1")?.textContent).toBe("3");
    expect(button(1, "+1")?.getAttribute("aria-pressed")).toBe("true");
    await act(async () => { request.resolve({ on: true }); await result; });
  });

  it("refuses writes in a read-only view", async () => {
    await mount(surface, false);
    await act(async () => { await hook.toggle(1, "+1", true); });
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.conversation).not.toHaveBeenCalled();
    expect(rows(surface)).toEqual([initial]);
  });
});
