// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSemanticIssueCache, useSemanticIssueSearch } from "./use-semantic-issue-search";

/** The picker-side hook (MIN-718): debounced, stale-proof, cached per scope. */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let seen: { ids: string[]; pending: boolean; answered: boolean } = { ids: [], pending: false, answered: false };
const fetchMock = vi.fn();

function Probe({ query, projectId = null }: { query: string; projectId?: string | null }) {
  seen = useSemanticIssueSearch(query, { projectId });
  return null;
}
const render = (query: string, projectId: string | null = null) =>
  act(() => root.render(createElement(Probe, { query, projectId })));

beforeEach(() => {
  vi.useFakeTimers();
  clearSemanticIssueCache();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const answer = (ids: string[]) => ({ ok: true, json: async () => ({ status: "ok", hits: ids.map((id) => ({ id })) }) });

describe("useSemanticIssueSearch", () => {
  it("waits for the debounce, and never asks for an identifier", async () => {
    fetchMock.mockResolvedValue(answer(["a"]));
    await render("MIN-42");
    await act(() => vi.advanceTimersByTimeAsync(1_000));
    expect(fetchMock).not.toHaveBeenCalled();

    await render("single sign-on login");
    expect(seen.pending).toBe(true);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(fetchMock).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(100));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=single+sign-on+login");
    expect(seen).toEqual({ ids: ["a"], pending: false, answered: true });
  });

  it("never lets a slow answer replace the current query's", async () => {
    let releaseOld: (value: unknown) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise((resolve) => { releaseOld = resolve; }))
      .mockResolvedValueOnce(answer(["new"]));
    await render("dark mode toggle");
    await act(() => vi.advanceTimersByTimeAsync(400));
    await render("dark theme colors");
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(seen.ids).toEqual(["new"]);
    // The first request was aborted; even if it resolves, nothing changes.
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal?.aborted).toBe(true);
    await act(async () => releaseOld(answer(["old"])));
    expect(seen.ids).toEqual(["new"]);
  });

  it("answers a repeated query from the cache, per scope", async () => {
    fetchMock.mockResolvedValue(answer(["a"]));
    await render("single sign-on login", "p1");
    await act(() => vi.advanceTimersByTimeAsync(400));
    await render("other words entirely", "p1");
    await render("Single  sign-on LOGIN", "p1");
    expect(seen).toEqual({ ids: ["a"], pending: false, answered: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await render("single sign-on login", "p2");
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not cache an outage", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "timeout", hits: [] }) })
      .mockResolvedValueOnce(answer(["a"]));
    await render("single sign-on login");
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(seen.ids).toEqual([]);
    expect(seen.answered).toBe(false);
    await render("something else here");
    await render("single sign-on login");
    await act(() => vi.advanceTimersByTimeAsync(400));
    expect(seen.ids).toEqual(["a"]);
  });
});
