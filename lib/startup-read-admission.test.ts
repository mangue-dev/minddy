// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { openStartupReads, STARTUP_READ_DEADLINE_MS, startupReadsAdmitted, useStartupReadsAdmitted } from "./startup-read-admission";

let client: QueryClient;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); client.clear(); });

it("holds a deferred read until the gate opens, then admits it once and for good", async () => {
  const queryFn = vi.fn(async () => "badge");
  function Badge() {
    const admitted = useStartupReadsAdmitted();
    useQuery({ queryKey: ["badge"], queryFn, enabled: admitted });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Badge))));
  expect(queryFn).not.toHaveBeenCalled();
  await act(async () => { openStartupReads(client); });
  expect(queryFn).toHaveBeenCalledOnce();
  openStartupReads(client);
  expect(startupReadsAdmitted(client)).toBe(true);
  await act(() => root.unmount());
});

it("admits reads after the deadline when no restoration opens the gate", () => {
  expect(startupReadsAdmitted(client)).toBe(false);
  vi.advanceTimersByTime(STARTUP_READ_DEADLINE_MS - 1);
  expect(startupReadsAdmitted(client)).toBe(false);
  vi.advanceTimersByTime(1);
  expect(startupReadsAdmitted(client)).toBe(true);
});

it("keeps one gate per QueryClient", () => {
  const other = new QueryClient();
  openStartupReads(client);
  expect(startupReadsAdmitted(other)).toBe(false);
});
