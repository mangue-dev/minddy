import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchClientRead = vi.hoisted(() => vi.fn());
vi.mock("./client-read", () => ({ fetchClientRead }));

import {
  loadIssuePromptContext,
  loadOneIssuePromptContext,
  prefetchIssuePromptContext,
  PROMPT_CONTEXT_COPY_WAIT_MS,
  PROMPT_CONTEXT_PREFETCH_BATCH_MS,
  PROMPT_CONTEXT_TIMEOUT_MS,
  PROMPT_CONTEXT_TTL_MS,
  resetIssuePromptContextCache,
  UNAVAILABLE_FORGE_CONTEXT,
} from "./issue-prompt-context";

const ID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const CONTEXT = {
  pullRequests: [{ number: 7, state: "open", url: "https://x/7", headBranch: "b", baseBranch: "main" }],
  repository: null,
};

function respondWith(issues: Record<string, unknown>) {
  return Response.json({ issues });
}

describe("loadIssuePromptContext", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchClientRead.mockReset();
    resetIssuePromptContextCache();
  });
  afterEach(() => vi.useRealTimers());

  it("reads the batch once, with a short deadline, skipping optimistic ids", async () => {
    fetchClientRead.mockResolvedValue(respondWith({ [ID]: { pullRequests: [], repository: null } }));
    const context = await loadIssuePromptContext([ID, "optimistic-1", ID, OTHER]);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
    expect(fetchClientRead.mock.calls[0][0]).toBe(`/api/issues/prompt-context?ids=${ID},${OTHER}`);
    expect(fetchClientRead.mock.calls[0][2]).toEqual({ timeoutMs: PROMPT_CONTEXT_TIMEOUT_MS });
    expect(context.get(ID)).toEqual({ pullRequests: [], repository: null });
    // An issue the server omitted stays unknown, never "no pull request".
    expect(context.has(OTHER)).toBe(false);
  });

  it("makes no request when no id is persisted", async () => {
    expect((await loadIssuePromptContext(["optimistic-1"])).size).toBe(0);
    expect(fetchClientRead).not.toHaveBeenCalled();
  });

  it("degrades to unavailable on an error status, so copying still works", async () => {
    fetchClientRead.mockResolvedValue(new Response("", { status: 500 }));
    expect(await loadOneIssuePromptContext(ID)).toEqual(UNAVAILABLE_FORGE_CONTEXT);
  });

  it("degrades to unavailable on a network failure or timeout", async () => {
    fetchClientRead.mockRejectedValueOnce(new Error("timeout"));
    expect(await loadOneIssuePromptContext(ID)).toEqual(UNAVAILABLE_FORGE_CONTEXT);
  });

  it("serves a prefetched issue without another request", async () => {
    fetchClientRead.mockResolvedValue(respondWith({ [ID]: CONTEXT }));
    prefetchIssuePromptContext([ID]);
    await vi.advanceTimersByTimeAsync(PROMPT_CONTEXT_PREFETCH_BATCH_MS);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);

    expect(await loadOneIssuePromptContext(ID)).toEqual(CONTEXT);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
  });

  it("coalesces prefetches within a window into one request", async () => {
    fetchClientRead.mockResolvedValue(respondWith({}));
    prefetchIssuePromptContext([ID]);
    prefetchIssuePromptContext([OTHER, ID, "optimistic-1"]);
    await vi.advanceTimersByTimeAsync(PROMPT_CONTEXT_PREFETCH_BATCH_MS);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
    expect(fetchClientRead.mock.calls[0][0]).toBe(`/api/issues/prompt-context?ids=${ID},${OTHER}`);
  });

  it("waits for an in-flight prefetch instead of reading twice", async () => {
    let answer!: (response: Response) => void;
    fetchClientRead.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));
    prefetchIssuePromptContext([ID]);
    await vi.advanceTimersByTimeAsync(PROMPT_CONTEXT_PREFETCH_BATCH_MS);

    const copy = loadOneIssuePromptContext(ID);
    answer(respondWith({ [ID]: CONTEXT }));
    expect(await copy).toEqual(CONTEXT);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
  });

  it("never holds a copy longer than the copy budget, and keeps the late answer", async () => {
    let answer!: (response: Response) => void;
    fetchClientRead.mockReturnValue(new Promise<Response>((resolve) => { answer = resolve; }));

    let copied: unknown;
    void loadOneIssuePromptContext(ID).then((context) => { copied = context; });
    await vi.advanceTimersByTimeAsync(PROMPT_CONTEXT_COPY_WAIT_MS - 1);
    expect(copied).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(copied).toEqual(UNAVAILABLE_FORGE_CONTEXT);

    // The slow read still lands, and serves the next copy at once.
    answer(respondWith({ [ID]: CONTEXT }));
    await vi.advanceTimersByTimeAsync(0);
    expect(await loadOneIssuePromptContext(ID)).toEqual(CONTEXT);
    expect(fetchClientRead).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failure, so the next copy retries", async () => {
    fetchClientRead.mockRejectedValueOnce(new Error("offline"));
    expect(await loadOneIssuePromptContext(ID)).toEqual(UNAVAILABLE_FORGE_CONTEXT);
    fetchClientRead.mockResolvedValueOnce(respondWith({ [ID]: CONTEXT }));
    expect(await loadOneIssuePromptContext(ID)).toEqual(CONTEXT);
    expect(fetchClientRead).toHaveBeenCalledTimes(2);
  });

  it("reads again once the cached context has expired", async () => {
    fetchClientRead.mockResolvedValue(respondWith({ [ID]: CONTEXT }));
    await loadOneIssuePromptContext(ID);
    await vi.advanceTimersByTimeAsync(PROMPT_CONTEXT_TTL_MS + 1);
    await loadOneIssuePromptContext(ID);
    expect(fetchClientRead).toHaveBeenCalledTimes(2);
  });
});
