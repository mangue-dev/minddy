// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { useAppTabMetadata } from "./use-app-tab-metadata";

vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
const project = "10000000-0000-4000-8000-000000000001";
const page = "20000000-0000-4000-8000-000000000001";
const pr = "40000000-0000-4000-8000-000000000001";
const hrefs = [`/projects/${project}/pages/${page}`, `/pull-requests?pr=${pr}`];
let root: Root;
let container: HTMLDivElement;
let client: QueryClient;
let fullRead: Mock<() => Promise<never>>;
let fetchMock: ReturnType<typeof vi.fn>;

function Labels() {
  const data = useAppTabMetadata(hrefs);
  return createElement("span", null, `${data.pageById.get(page)?.title ?? "missing"}/${data.prById.get(pr)?.title ?? "missing"}`);
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fullRead = vi.fn(async () => { throw new Error("A label must not fetch a full surface"); });
  client = new QueryClient({ defaultOptions: { queries: { queryFn: () => fullRead(), retry: false } } });
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({
    pages: [{ id: page, project_id: project, title: "Stored page", icon: null }],
    objectives: [], pullRequests: [{ id: pr, number: 42, title: "Stored PR" }], routines: [], issues: [],
  }) }));
  vi.stubGlobal("fetch", fetchMock);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  client.clear();
  vi.useRealTimers();
  container.remove();
  vi.unstubAllGlobals();
});
const settle = async () => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); }); };

describe("tab label cache subscriptions", () => {
  it("releases full PR patches while keeping a live compact label through GC", async () => {
    vi.useFakeTimers();
    client.setQueryDefaults(["pull-request"], { gcTime: 60_000 });
    client.setQueryData(["pull-request", pr], { pr: { number: 42, title: "Cached PR" }, files: [{ patch: "x".repeat(1024 * 1024) }] });
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Labels))));
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(container.textContent).toBe("Stored page/Cached PR");
    expect(client.getQueryCache().find({ queryKey: ["pull-request", pr] })?.getObserversCount()).toBe(0);
    await act(async () => { await vi.advanceTimersByTimeAsync(60_001); });
    expect(client.getQueryData(["pull-request", pr])).toBeUndefined();
    expect(container.textContent).toBe("Stored page/Cached PR");
    await vi.advanceTimersByTimeAsync(1);
    fetchMock.mockResolvedValueOnce(Response.json({ pages: [{ id: page, project_id: project, title: "Stored page", icon: null }],
      objectives: [], pullRequests: [{ id: pr, number: 42, title: "Fresh metadata" }], routines: [], issues: [] }));
    await act(async () => { await client.invalidateQueries({ queryKey: ["app-tab-metadata"] }); await vi.advanceTimersByTimeAsync(10); });
    expect(container.textContent).toBe("Stored page/Fresh metadata");
    await act(async () => client.setQueryData(["pull-request", pr], { pr: { number: 42, title: "New title" }, files: [] }));
    expect(container.textContent).toBe("Stored page/New title");
    await act(async () => client.setQueryData(["pull-request", pr], { pr: null }));
    expect(container.textContent).toBe("Stored page/missing");
    expect(fullRead).not.toHaveBeenCalled();
  });

  it("keeps cached labels during an outage and adopts fresh metadata after recovery", async () => {
    await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Labels))));
    await settle();
    await act(() => client.setQueryData(["pages", project], [{ id: page, project_id: project, title: "Cached title", icon: null }]));
    await settle();
    expect(container.textContent).toBe("Cached title/Stored PR");
    await act(() => client.invalidateQueries({ queryKey: ["pages", project], refetchType: "none" }));
    fetchMock.mockRejectedValueOnce(new Error("Unavailable"));
    await act(() => client.invalidateQueries({ queryKey: ["app-tab-metadata"] }));
    await settle();
    expect(container.textContent).toBe("Cached title/Stored PR");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({
      pages: [{ id: page, project_id: project, title: "Remote title", icon: null }],
      objectives: [], pullRequests: [{ id: pr, number: 42, title: "Stored PR" }], routines: [], issues: [],
    }) });
    await act(() => client.invalidateQueries({ queryKey: ["app-tab-metadata"] }));
    await settle();
    expect(container.textContent).toBe("Remote title/Stored PR");
    expect(fullRead).not.toHaveBeenCalled();
  });

  it("uses one narrow read and immediately follows cached renames and deletions", async () => {
    await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Labels))));
    await settle();
    expect(container.textContent).toBe("Stored page/Stored PR");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/me/app-tabs/metadata");
    expect(fullRead).not.toHaveBeenCalled();
    await act(() => client.setQueryData(["pages", project], [{ id: page, project_id: project, title: "Local draft title", icon: null }]));
    await settle();
    expect(container.textContent).toBe("Local draft title/Stored PR");
    await act(() => client.setQueryData(["pages", project], []));
    await settle();
    expect(container.textContent).toBe("missing/Stored PR");
    await act(() => client.setQueryData(["pull-request", pr], { pr: { number: 42, title: "Live title" } }));
    await settle();
    expect(container.textContent).toBe("missing/Live title");
    expect(fullRead).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
