// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useScratchpadDoc } from "@/lib/use-scratchpad-query";

let latest: ReturnType<typeof useScratchpadDoc> | null = null;

function Harness() {
  latest = useScratchpadDoc({
    open: false,
    liveRef: { current: null },
    applyRef: { current: null },
  });
  return null;
}

function response(status: number, body: unknown) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
}

describe("useScratchpadDoc saving", () => {
  let container: HTMLDivElement;
  let root: Root;
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    (window as typeof window & { IS_REACT_ACT_ENVIRONMENT: boolean })
      .IS_REACT_ACT_ENVIRONMENT = true;
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    const client = new QueryClient();
    act(() =>
      root.render(createElement(QueryClientProvider, { client }, createElement(Harness)))
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    delete (window as typeof window & { IS_REACT_ACT_ENVIRONMENT?: boolean })
      .IS_REACT_ACT_ENVIRONMENT;
  });

  it("reports a failed save and retries it until it lands", async () => {
    fetchMock
      .mockResolvedValueOnce(response(500, { error: "unavailable" }))
      .mockResolvedValueOnce(
        response(200, { content: "note", updated_at: "2026-11-07T10:00:00Z", rev: 1 })
      );

    await act(async () => { latest!.save("note"); });
    expect(latest!.isSaving).toBe(false);
    expect(latest!.saveRetrying).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({ content: "note" });
    expect(latest!.saveRetrying).toBe(false);
    expect(latest!.isSaving).toBe(false);
  });

  it("does not retry a save the server refuses", async () => {
    fetchMock.mockResolvedValueOnce(response(413, { error: "too large" }));

    await act(async () => { latest!.save("a very long note"); });
    expect(latest!.saveRefused).toBe(true);
    expect(latest!.saveRetrying).toBe(false);

    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
