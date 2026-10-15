// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePageActivityWarmup } from "./page-activity-cache";
import { fetchPageBacklinksApi, fetchPageEventsApi } from "./pages-api";

vi.mock("./pages-api", () => ({ fetchPageEventsApi: vi.fn(async () => []), fetchPageBacklinksApi: vi.fn(async () => []) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined, client: QueryClient;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  client.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function Surface({ page }: { page: { version: number } }) {
  usePageActivityWarmup("project", "page", page);
  return null;
}
async function render(version: number, mode: "visible" | "hidden" = "visible") {
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(<QueryClientProvider client={client}>
    <Activity mode={mode}><Surface page={{ version }} /></Activity>
  </QueryClientProvider>));
}

it("warms page activity once per activation, not on every accepted save", async () => {
  await render(1);
  // Each autosave acknowledgement replaces the page object, past the 30 s freshness.
  for (const version of [2, 3]) {
    await act(async () => { vi.advanceTimersByTime(31_000); });
    await render(version);
  }
  expect(fetchPageEventsApi).toHaveBeenCalledTimes(1);
  expect(fetchPageBacklinksApi).toHaveBeenCalledTimes(1);
  // Coming back to the retained surface is a new activation.
  await render(3, "hidden");
  await render(3);
  expect(fetchPageEventsApi).toHaveBeenCalledTimes(2);
  expect(fetchPageBacklinksApi).toHaveBeenCalledTimes(2);
});
