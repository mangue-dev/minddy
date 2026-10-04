// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AppTabRouteProvider } from "./app-tab-route-context";
import { useAgentRunEventsQuery } from "./use-agent-runs";

const fetchEvents = vi.hoisted(() => vi.fn());
vi.mock("./agent-api", async original => ({
  ...await original<Record<string, unknown>>(), fetchAgentRunEventsApi: fetchEvents,
}));
let root: Root;
let host: HTMLElement;
let client: QueryClient;
function Viewer({ active }: { active: boolean }) {
  const { events } = useAgentRunEventsQuery("run", active);
  return createElement("span", null, events.map(event => event.seq).join(","));
}
async function render(active = true, mounted = true) {
  await act(() => root.render(createElement(QueryClientProvider, { client },
    createElement(AppTabRouteProvider, {
      active: false, route: { pathname: "/agents", search: "", projectId: null },
      children: mounted ? createElement(Viewer, { active }) : null,
    }))));
  await act(() => vi.advanceTimersByTimeAsync(1));
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchEvents.mockReset().mockResolvedValue({ events: [{ id: "first", seq: 0,
    type: "summary", payload: null, created_at: "2026-10-04" }] });
  host = document.createElement("div");
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("preserves the two-second background event poll needed by compact conversations", async () => {
  await render();
  expect(fetchEvents).toHaveBeenCalledTimes(1);
  expect(fetchEvents.mock.calls[0][1]).toBeUndefined();
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(fetchEvents).toHaveBeenCalledTimes(2);
  expect(fetchEvents.mock.calls[1][1]).toBe(0);
  await render(false);
  await act(() => vi.advanceTimersByTimeAsync(6000));
  expect(fetchEvents).toHaveBeenCalledTimes(2);
});

it("fully reconciles after remounts and explicit invalidation", async () => {
  await render(false);
  await render(false, false);
  await render(false);
  expect(fetchEvents).toHaveBeenCalledTimes(2);
  expect(fetchEvents.mock.calls[1][1]).toBeUndefined();
  await act(() => client.invalidateQueries({ queryKey: ["agent-run-events", "run"] }));
  expect(fetchEvents).toHaveBeenCalledTimes(3);
  expect(fetchEvents.mock.calls[2][1]).toBeUndefined();
});

it("recovers failed delta reads with an authoritative full history", async () => {
  await render();
  fetchEvents.mockRejectedValueOnce(new Error("Offline"));
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(fetchEvents.mock.calls[1][1]).toBe(0);
  await act(() => vi.advanceTimersByTimeAsync(2000));
  expect(fetchEvents.mock.calls[2][1]).toBeUndefined();
});
