// @vitest-environment jsdom
import { Activity, act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { AppTabRouteProvider } from "./app-tab-route-context";
import { usePullRequestQuery } from "./use-agent-runs";
import { pullRequestQueryOptions } from "./pull-request-query";

it("requires authority after a retained activation even if hidden rendering was deferred", async () => {
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
    return createElement("span", null, query.readState);
  }
  const render = (active: boolean, activatedAt: number) => act(() => root.render(
    createElement(QueryClientProvider, { client }, createElement(Activity, { mode: active ? "visible" : "hidden",
      children: createElement(AppTabRouteProvider, { route: { pathname: "/pull-requests", search: "pr=pr", projectId: null }, active, activatedAt, children: createElement(Detail) }),
    })),
  ));
  try {
    await render(true, now);
    await act(async () => { pending.shift()!(Response.json({ pr: { headSha: "initial" } })); });
    await act(async () => { await vi.waitFor(() => expect(container.textContent).toBe("fresh")); });
    await render(false, now);
    now = 20;
    const preparation = client.fetchQuery(pullRequestQueryOptions("pr"));
    now = 30;
    const start = states.length;
    await render(true, now);
    await act(async () => { pending.shift()!(Response.json({ pr: { headSha: "old-preparation" } })); await preparation; });
    await act(async () => { await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(3)); });
    expect(states.slice(start).some((row) => row.head === "old-preparation" && row.state === "fresh")).toBe(false);
    await act(async () => { pending.shift()!(Response.json({ pr: { headSha: "current" } })); });
    await act(async () => { await vi.waitFor(() => expect(container.textContent).toBe("fresh")); });
    expect(states.at(-1)).toEqual({ head: "current", state: "fresh" });
  } finally {
    await act(() => root.unmount()); client.clear(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals();
  }
});
