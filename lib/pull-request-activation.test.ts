// @vitest-environment jsdom
import { Activity, act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AppTabRouteProvider } from "./app-tab-route-context";
import { usePullRequestQuery } from "./use-agent-runs";
import { pullRequestQueryOptions } from "./pull-request-query";
import { nextReadActivationSequence } from "./read-activation-sequence";
import { QueryReadBoundary } from "@/components/query-read-boundary";

vi.mock("./supabase", () => ({ getSupabase: () => ({
  auth: { getSession: async () => ({ data: { session: { user: { id: "owner" } } }, error: null }) },
}) }));

it.each(["later millisecond", "same millisecond", "clock rollback"])("requires authority after a retained activation with %s even if hidden rendering was deferred", async (timing) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let now = 10;
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const pending: ((response: Response) => void)[] = [];
  const fetch = vi.fn(() => new Promise<Response>((resolve) => pending.push(resolve)));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  const states: { head: string | undefined; state: string }[] = [];
  function Detail() {
    const query = usePullRequestQuery("pr", true);
    states.push({ head: query.pr?.headSha, state: query.readState });
    return createElement(QueryReadBoundary, { phase: query.readState, fallback: "Waiting",
      children: createElement("span", null, query.pr?.headSha) });
  }
  const render = (active: boolean, activationSequence: number) => act(() => root.render(
    createElement(QueryClientProvider, { client }, createElement(Activity, { mode: active ? "visible" : "hidden",
      children: createElement(AppTabRouteProvider, { route: { pathname: "/pull-requests", search: "pr=pr", projectId: null }, active, activationSequence, children: createElement(Detail) }),
    })),
  ));
  try {
    const initialActivation = nextReadActivationSequence();
    await render(true, initialActivation);
    await act(async () => { pending.shift()!(Response.json({ pr: { headSha: "initial" } })); });
    await act(async () => { await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-query-read-phase")).toBe("fresh")); });
    await render(false, initialActivation);
    now = 20;
    const preparation = client.fetchQuery(pullRequestQueryOptions("pr"));
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    now = timing === "later millisecond" ? 30 : timing === "same millisecond" ? 20 : 5;
    const start = states.length;
    await render(true, nextReadActivationSequence());
    await act(async () => { pending.shift()!(Response.json({ pr: { headSha: "old-preparation" } })); await preparation; });
    await act(async () => { await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3)); });
    expect(states.slice(start).some((row) => row.head === "old-preparation" && row.state === "fresh")).toBe(false);
    expect(getComputedStyle(container.querySelector("span")!).visibility).toBe("hidden");
    expect(container.querySelector("span")?.closest("[inert][aria-hidden='true']")).not.toBeNull();
    await act(async () => { pending.shift()!(Response.json({ pr: { headSha: "current" } })); });
    await act(async () => { await vi.waitFor(() => expect(container.firstElementChild?.getAttribute("data-query-read-phase")).toBe("fresh")); });
    expect(getComputedStyle(container.querySelector("span")!).visibility).toBe("visible");
    expect(container.querySelector("span")?.textContent).toBe("current");
    expect(states.at(-1)).toEqual({ head: "current", state: "fresh" });
  } finally {
    await act(() => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});

it.each([0, 60_001, 300_000])("keeps a loaded snapshot visible after %i ms while revalidating mutation authority", async (age) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  let now = Date.now();
  vi.spyOn(Date, "now").mockImplementation(() => now);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  let release!: (response: Response) => void;
  const fetch = vi.fn<typeof globalThis.fetch>()
    .mockResolvedValueOnce(Response.json({ pr: { headSha: "prepared" }, files: [] }))
    .mockImplementation(() => new Promise<Response>((resolve) => { release = resolve; }));
  vi.stubGlobal("fetch", fetch);
  await client.fetchQuery(pullRequestQueryOptions("pr"));
  now += age;
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  function Detail() {
    const query = usePullRequestQuery("pr", true);
    return createElement(QueryReadBoundary, { phase: query.displayReadState, fallback: createElement("div", { "data-skeleton": true }),
      children: createElement("button", { disabled: query.readState !== "fresh" }, `${query.pr?.headSha}:${query.readState}:${query.displayReadState}`) });
  }
  try {
    await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(Detail))));
    expect(container.textContent).toBe("prepared:refreshing:fresh");
    const content = container.querySelector("button")!;
    expect(getComputedStyle(content).visibility).toBe("visible");
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(content.disabled).toBe(true);
    await act(async () => { release(Response.json({ pr: { headSha: "current" }, files: [] })); });
    await act(async () => { await vi.waitFor(() => expect(client.isFetching()).toBe(0)); await new Promise((resolve) => setTimeout(resolve, 10)); });
    expect(container.textContent).toBe("current:fresh:fresh");
    expect(container.querySelector("button")).toBe(content);
    expect(content.disabled).toBe(false);
  } finally {
    await act(() => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
