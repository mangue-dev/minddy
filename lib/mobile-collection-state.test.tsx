// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useCollectionFilters } from "./use-collection-filters";
import { MobileCollectionStateProvider, useMobileCollectionState } from "./mobile-collection-state";

const viewport = vi.hoisted(() => ({ mobile: true }));
vi.mock("./use-mobile-layout", () => ({ useMobileLayout: () => viewport.mobile }));
afterEach(() => vi.unstubAllGlobals());
it("retains mobile filters and group state across selection while isolating routes and desktop", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewport.mobile = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Controls({ route }: { route: string }) {
    const [query, setQuery] = useMobileCollectionState(route, "query", "");
    const [groups, setGroups] = useMobileCollectionState<ReadonlySet<string>>(route, "groups", () => new Set());
    return <>
      <button data-query onClick={() => setQuery("navigation")}>{query}</button>
      <button data-groups onClick={() => setGroups(previous => new Set([...previous, "review"]))}>{[...groups].join(",")}</button>
    </>;
  }
  const render = (key: string, route = "/pull-requests") => act(() => root.render(<MobileCollectionStateProvider><Controls key={key} route={route} /></MobileCollectionStateProvider>));
  try {
    await render("browse");
    await act(() => { host.querySelector<HTMLButtonElement>("[data-query]")!.click(); host.querySelector<HTMLButtonElement>("[data-groups]")!.click(); });
    await render("active");
    expect(host.querySelector("[data-query]")?.textContent).toBe("navigation");
    expect(host.querySelector("[data-groups]")?.textContent).toBe("review");
    await render("routines", "/routines");
    expect(host.querySelector("[data-query]")?.textContent).toBe("");
    viewport.mobile = false;
    await render("desktop");
    expect(host.querySelector("[data-query]")?.textContent).toBe("");
    expect(host.querySelector("[data-groups]")?.textContent).toBe("");
    await act(() => host.querySelector<HTMLButtonElement>("[data-groups]")!.click());
    viewport.mobile = true;
    await render("mobile-again");
    expect(host.querySelector("[data-query]")?.textContent).toBe("navigation");
    expect(host.querySelector("[data-groups]")?.textContent).toBe("review");
  } finally { await act(() => root.unmount()); }
});

it("honors an explicit objective destination over retained mobile filters and follows history changes", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  viewport.mobile = true;
  const host = document.createElement("div");
  const root = createRoot(host);
  function Controls({ params }: { params: URLSearchParams }) {
    const [filters, change] = useCollectionFilters("/feedback", params);
    return <button onClick={() => change({ objective: ["retained"] })}>{JSON.stringify(filters)}</button>;
  }
  const render = (key: string, query: string) => act(() => root.render(<MobileCollectionStateProvider><Controls key={key} params={new URLSearchParams(query)} /></MobileCollectionStateProvider>));
  try {
    window.history.replaceState(null, "", "/feedback?post=request#discussion");
    await render("first", "");
    await act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(window.location.search).toBe("?post=request&objective=retained");
    expect(window.location.hash).toBe("#discussion");
    await render("new-destination", "objective=explicit");
    expect(host.textContent).toContain("explicit");
    expect(host.textContent).not.toContain("retained");
    await render("new-destination", "");
    expect(host.textContent).toBe("{}");
  } finally { await act(() => root.unmount()); }
});
