// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabRouteProvider } from "./app-tab-route-context";
import { useAgentRunLive, useAgentRunLocalDiff } from "./use-agent-run-live";

const realtime = vi.hoisted(() => ({
  channel: vi.fn(() => ({ on: vi.fn(), subscribe: vi.fn() })),
  removeChannel: vi.fn(),
  setAuth: vi.fn(async () => {}),
  rekeyCleanup: vi.fn(),
  resolveTopic: vi.fn(async () => "private-run-topic"),
}));
vi.mock("./supabase", () => ({ getSupabase: () => ({
  channel: realtime.channel, removeChannel: realtime.removeChannel,
  realtime: { setAuth: realtime.setAuth },
}) }));
vi.mock("./realtime-topic", () => ({
  onRealtimeRekey: () => realtime.rekeyCleanup,
  resolveRealtimeTopic: realtime.resolveTopic,
}));

let root: Root;
let host: HTMLElement;
let client: QueryClient;
let at: number;
let visibility: DocumentVisibilityState;
const response = (timestamp: number) => ({ ok: true, json: async () => ({
  stream: { at: timestamp, text: `Snapshot ${timestamp}` },
  diff: { at: timestamp, files: [{ filename: `file-${timestamp}.ts` }] },
}) }) as Response;
const read = vi.fn<(url: string, init: RequestInit) => Promise<Response>>();

function Viewer({ diff = false }: { diff?: boolean }) {
  const live = useAgentRunLive("run-1", true);
  const files = useAgentRunLocalDiff("run-1", diff);
  return createElement("span", null, `${live?.text ?? ""}|${files?.files[0]?.filename ?? ""}`);
}
async function render(active: boolean, viewers = 1) {
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(AppTabRouteProvider, {
      active, route: { pathname: "/agents", search: "", projectId: null },
      children: Array.from({ length: viewers }, (_, i) => createElement(Viewer, { key: i, diff: true })),
    }))));
}
async function renderSeparateViews(secondActive: boolean) {
  const view = (active: boolean, key: string) => createElement(AppTabRouteProvider, {
    key, active, route: { pathname: "/agents", search: "", projectId: null },
    children: createElement(Viewer, { diff: true }),
  });
  await act(() => root.render(createElement(QueryClientProvider, { client },
    view(true, "first"), view(secondActive, "second"))));
}
async function show(value: DocumentVisibilityState) {
  visibility = value;
  await act(() => document.dispatchEvent(new Event("visibilitychange")));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  at = 0;
  read.mockReset().mockImplementation(async () => response(++at));
  vi.stubGlobal("fetch", read);
  host = document.createElement("div");
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("agent live snapshot lifecycle", () => {
  it("shares one read and private channel across stream, diff and two visible views", async () => {
    await render(true, 2);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0][0]).toBe("/api/agent-runs/run-1/live");
    expect(read.mock.calls[0][1].cache).toBe("no-store");
    expect(realtime.channel).toHaveBeenCalledWith("private-run-topic", { config: { private: true } });
    expect(realtime.channel).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("Snapshot 1|file-1.tsSnapshot 1|file-1.ts");
    await render(true);
    expect(realtime.removeChannel).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(read).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("Snapshot 2|file-2.ts");
    await render(false);
    expect(realtime.removeChannel).toHaveBeenCalledTimes(1);
    expect(realtime.rekeyCleanup).toHaveBeenCalledTimes(1);
  });

  it("does not read an inactive retained view and catches up on each activation", async () => {
    await render(false);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(read).not.toHaveBeenCalled();
    await render(true);
    expect(host.textContent).toBe("Snapshot 1|file-1.ts");
    await render(false);
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(read).toHaveBeenCalledTimes(1);
    await render(true);
    expect(read).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("Snapshot 2|file-2.ts");
  });

  it("replays the current snapshot when one retained view resumes beside another subscriber", async () => {
    await renderSeparateViews(false);
    expect(host.textContent).toBe("Snapshot 1|file-1.ts|");
    await renderSeparateViews(true);
    expect(read).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("Snapshot 1|file-1.tsSnapshot 1|file-1.ts");
    await renderSeparateViews(false);
    expect(realtime.removeChannel).not.toHaveBeenCalled();
    await renderSeparateViews(true);
    expect(host.textContent).toBe("Snapshot 1|file-1.tsSnapshot 1|file-1.ts");
  });

  it("does not replay provisional text superseded by a persisted Realtime event", async () => {
    await renderSeparateViews(false);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const onEvent = realtime.channel.mock.results[0].value.on.mock.calls[0][2];
    await act(() => onEvent({ payload: { id: "event-1", type: "summary" } }));
    expect(host.textContent).toBe("|file-1.ts|");
    await renderSeparateViews(true);
    expect(host.textContent).toBe("|file-1.ts|file-1.ts");
    expect(read).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["agent-run-events", "run-1"] });
  });

  it("keeps the last snapshot hidden and reads the latest stream and diff on return", async () => {
    await render(true);
    await show("hidden");
    await act(() => vi.advanceTimersByTimeAsync(60_000));
    expect(read).toHaveBeenCalledTimes(1);
    expect(host.textContent).toBe("Snapshot 1|file-1.ts");
    expect(realtime.removeChannel).not.toHaveBeenCalled();
    at = 10;
    await show("visible");
    expect(read).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("Snapshot 11|file-11.ts");
  });

  it("discards an abandoned JSON body and immediately retries after its cancellation settles", async () => {
    let finish!: (value: unknown) => void;
    read.mockResolvedValueOnce({ ok: true, json: () => new Promise(resolve => { finish = resolve; }) } as Response);
    await render(true);
    const signal = read.mock.calls[0][1].signal!;
    await show("hidden");
    expect(signal.aborted).toBe(true);
    await show("visible");
    expect(read).toHaveBeenCalledTimes(1);
    await act(() => finish({ stream: { at: 100, text: "Abandoned" }, diff: null }));
    expect(read).toHaveBeenCalledTimes(2);
    expect(host.textContent).toBe("Snapshot 1|file-1.ts");
  });

  it("preserves the last snapshot across failed HTTP and network reads", async () => {
    await render(true);
    read.mockResolvedValueOnce({ ok: false } as Response)
      .mockRejectedValueOnce(new Error("Offline"));
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(read).toHaveBeenCalledTimes(3);
    expect(host.textContent).toBe("Snapshot 1|file-1.ts");
    await act(() => vi.advanceTimersByTimeAsync(500));
    expect(host.textContent).toBe("Snapshot 2|file-2.ts");
  });
});
