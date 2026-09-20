import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { PAGE_CONTENT_SEARCH_GC_MS, pageContentSearchQuery } from "./page-content-search-query";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("page content search lifetime", () => {
  it("aborts obsolete reads when typing changes the observed search", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn((_url, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))));
    }));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(client, pageContentSearchQuery("first"));
    const stop = observer.subscribe(() => {});
    observer.setOptions(pageContentSearchQuery("second"));
    expect(signals).toHaveLength(2);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);
    stop();
    expect(signals[1].aborted).toBe(true);
    client.clear();
  });

  it("reuses a recent result and releases abandoned query caches after one minute", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(async () => ({ ok: true, json: async () => [{ pageId: "p1", snippet: "A result" }] }));
    vi.stubGlobal("fetch", fetch);
    const client = new QueryClient();
    const options = pageContentSearchQuery("result");
    await client.fetchQuery(options);
    await client.fetchQuery(options);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PAGE_CONTENT_SEARCH_GC_MS + 1);
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    client.clear();
  });
});
