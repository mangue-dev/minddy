// @vitest-environment jsdom
import { act, createElement, useCallback, useSyncExternalStore, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { retainedBoardKeys } from "./retained-board-read-state";
import type { RetainedAppView } from "./retained-app-views";

const navigation = vi.hoisted(() => ({ pathname: "/all", boardPathname: "/all", projectId: null as string | null }));
const session = { getActiveHref: () => navigation.pathname, isRetainedDestination: () => false };
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname, useSearchParams: () => new URLSearchParams() }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/app-tabs-context", () => ({
  useAppTabs: () => ({ session, activeId: navigation.pathname, tabs: [{ id: navigation.boardPathname, href: navigation.boardPathname }, { id: "/settings", href: "/settings" }] }),
  AppTabNavigationScope: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/app-tab-route-context", () => ({ AppTabRouteProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/use-cold-board-prefetch", () => ({ useColdBoardPrefetch: () => {} }));
vi.mock("@/components/retained-board-title", () => ({ RetainedBoardTitle: () => null }));
vi.mock("@/components/board-loading-skeleton", () => ({ BoardLoadingSkeleton: () => createElement("div", { "data-skeleton": true }) }));
// Exercise the real host and boundary with a small query-backed board surface.
vi.mock("next/dynamic", () => ({ default: () => function Board() {
  const client = useQueryClient();
  const subscribe = useCallback((notify: () => void) => client.getQueryCache().subscribe(notify), [client]);
  const snapshot = useCallback(() => client.getQueryData<string[]>(navigation.projectId ? ["issues", navigation.projectId] : ["me", "board"]), [client]);
  const data = useSyncExternalStore(subscribe, snapshot);
  return createElement("div", { "data-scroller": true }, ...((data ?? []).map((title) => createElement("button", { key: title }, title))));
} }));

import { AppTabViewHost } from "@/components/app-tab-view-host";

afterEach(() => vi.unstubAllGlobals());

const boards: RetainedAppView[] = [
  { key: "global", tabId: "/all", kind: "global-board", route: { pathname: "/all", search: "", projectId: null } },
  { key: "project", tabId: "/projects/p", kind: "project-board", route: { pathname: "/projects/p", search: "", projectId: "p" } },
];

it.each(boards)("keeps $kind cards interactive during resume and activation refreshes, then applies new rows", async (view) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: 300_000, retry: false } } });
  navigation.pathname = navigation.boardPathname = view.route.pathname;
  navigation.projectId = view.route.projectId;
  let refreshing = false;
  const pending: (() => void)[] = [];
  const read = vi.fn(() => refreshing ? new Promise<string[]>((resolve) => pending.push(() => resolve(["Existing card", "New card"]))) : Promise.resolve(["Existing card"]));
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  const render = () => act(() => root.render(createElement(QueryClientProvider, { client }, createElement(AppTabViewHost, { children: null }))));
  const keys = retainedBoardKeys(view);
  try {
    for (const queryKey of keys) await client.fetchQuery({ queryKey, queryFn: read });
    await render();
    const card = container.querySelector("button")!;
    const scroller = container.querySelector<HTMLElement>("[data-scroller]")!;
    scroller.scrollTop = 240;
    card.focus();
    refreshing = true;
    // Resume catch-up invalidates the shared cache; hold the request open.
    let resumed!: Promise<void>;
    await act(() => { resumed = client.invalidateQueries({ queryKey: keys[0], exact: true }); });
    expect(read).toHaveBeenCalledTimes(keys.length + 1);
    expect(container.querySelector('[data-board-read-state="refreshing"]')).not.toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(getComputedStyle(card).visibility).toBe("visible");
    expect(card.closest("[inert], [aria-hidden='true']")).toBeNull();
    expect(document.activeElement).toBe(card);
    expect(scroller.scrollTop).toBe(240);
    await act(async () => { pending.splice(0).forEach((finish) => finish()); await resumed; });
    expect(container.textContent).toContain("New card");
    expect(container.querySelector("button")).toBe(card);

    navigation.pathname = "/settings";
    await render();
    await act(() => client.invalidateQueries({ queryKey: keys[0], exact: true, refetchType: "none" }));
    navigation.pathname = view.route.pathname;
    await render();
    expect(container.querySelector('[data-board-read-state="refreshing"]')).not.toBeNull();
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    expect(container.querySelector("button")).toBe(card);
    expect(getComputedStyle(card).visibility).toBe("visible");
    expect(scroller.scrollTop).toBe(240);
    await act(async () => { pending.splice(0).forEach((finish) => finish()); await vi.waitFor(() => expect(client.isFetching()).toBe(0)); });
    expect(container.querySelector('[data-board-read-state="fresh"]')).not.toBeNull();
  } finally { await act(() => root.unmount()); container.remove(); client.clear(); }
});

it.each(boards)("retains the $kind initial skeleton and conceals rows after failed or paused reads", async (view) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigation.pathname = navigation.boardPathname = view.route.pathname;
  navigation.projectId = view.route.projectId;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const container = document.body.appendChild(document.createElement("div"));
  const root = createRoot(container);
  try {
    await act(() => root.render(createElement(QueryClientProvider, { client }, createElement(AppTabViewHost, { children: null }))));
    expect(container.querySelector("[data-skeleton]")).not.toBeNull();
    await act(() => { for (const key of retainedBoardKeys(view)) client.setQueryData(key, ["Loaded card"]); });
    expect(container.querySelector("[data-skeleton]")).toBeNull();
    const card = container.querySelector("button")!;
    await act(() => client.fetchQuery({ queryKey: retainedBoardKeys(view)[0], queryFn: () => { throw new Error("Authorization failed"); } }).catch(() => {}));
    expect(getComputedStyle(card).visibility).toBe("hidden");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("readError");
    await act(() => { client.getQueryCache().find({ queryKey: retainedBoardKeys(view)[0], exact: true })!.setState({ fetchStatus: "paused" }); });
    expect(getComputedStyle(card).visibility).toBe("hidden");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("readPaused");
  } finally { await act(() => root.unmount()); container.remove(); client.clear(); }
});
