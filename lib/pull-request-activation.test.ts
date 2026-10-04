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
