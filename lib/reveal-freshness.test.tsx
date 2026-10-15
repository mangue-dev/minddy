// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Activity, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openRealtimeCoverage, type RealtimeCoverageScope } from "./realtime-coverage";
import { REVEAL_FRESHNESS_MS } from "./reveal-freshness";
import { useRoutineRunsQuery, useRoutinesQuery } from "./use-routines-query";
import { useIssueAgentRunsQuery } from "./use-agent-runs";

const api = vi.hoisted(() => ({
  routines: vi.fn(async () => ({ routines: [] })),
  routineRuns: vi.fn(async () => ({ runs: [] })),
  issueRuns: vi.fn(async () => ({ runs: [], pullRequest: null })),
}));
vi.mock("./routines-api", () => ({ fetchRoutinesApi: api.routines, fetchRoutineRunsApi: api.routineRuns }));
vi.mock("./agent-api", async (importOriginal) => ({
  ...await importOriginal<typeof import("./agent-api")>(),
  fetchIssueAgentRunsApi: api.issueRuns,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined, client: QueryClient, coverage: RealtimeCoverageScope;
beforeEach(() => {
  vi.useFakeTimers();
  client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  coverage = openRealtimeCoverage();
  coverage.joined();
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = undefined;
  coverage.close();
  client.clear();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function RetainedViews() {
  useRoutinesQuery();
  useRoutineRunsQuery("routine-1");
  useIssueAgentRunsQuery("issue-1");
  return null;
}
async function render(mode: "visible" | "hidden") {
  root ??= createRoot(document.createElement("div"));
  await act(async () => root!.render(<QueryClientProvider client={client}>
    <Activity mode={mode}><RetainedViews /></Activity>
  </QueryClientProvider>));
}
async function reveal(afterMs: number) {
  await render("hidden");
  await act(async () => { vi.advanceTimersByTime(afterMs); });
  await render("visible");
}
const reads = () => [api.routines.mock.calls.length, api.routineRuns.mock.calls.length, api.issueRuns.mock.calls.length];

describe("reveal freshness of realtime-covered reads", () => {
  it("keeps a recent cache on reveal while realtime is joined", async () => {
    await render("visible");
    expect(reads()).toEqual([1, 1, 1]);
    await reveal(5_000);
    expect(reads()).toEqual([1, 1, 1]);
  });

  it("reads again once the cache is older than the window", async () => {
    await render("visible");
    await reveal(REVEAL_FRESHNESS_MS + 1);
    expect(reads()).toEqual([2, 2, 2]);
  });

  it("reads again after a realtime invalidation reached the hidden view", async () => {
    await render("visible");
    await render("hidden");
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["routines"] });
      await client.invalidateQueries({ queryKey: ["agent-runs", "issue", "issue-1"] });
    });
    expect(reads()).toEqual([1, 1, 1]);
    await render("visible");
    expect(reads()).toEqual([2, 2, 2]);
  });

  it("reads again while a realtime scope is not joined", async () => {
    await render("visible");
    coverage.dropped();
    await reveal(1_000);
    expect(reads()).toEqual([2, 2, 2]);
    coverage.joined();
    const late = openRealtimeCoverage();
    try {
      await reveal(1_000);
      expect(reads()).toEqual([3, 3, 3]);
    } finally { late.close(); }
  });

  it("reads on every mount when no realtime scope is open", async () => {
    coverage.close();
    await render("visible");
    await reveal(1_000);
    expect(reads()).toEqual([2, 2, 2]);
  });
});
