// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ pathname: "/home", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => h.pathname,
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/lib/app-tabs-context", () => ({
  useOptionalAppTabs: () => null,
  useAppTabs: () => { throw new Error("no tabs"); },
  useOptionalAppTabNavigation: () => null,
  AppTabNavigationScope: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/retained-board-title", () => ({ RetainedBoardTitle: () => null }));
vi.mock("@/components/route-loading-skeleton", () => ({
  RouteLoadingSkeleton: ({ pathname }: { pathname: string }) => <div data-skeleton={pathname} />,
}));

const {
  PENDING_NAVIGATION_DELAY_MS, PENDING_NAVIGATION_TIMEOUT_MS,
  beginPendingNavigation, clearPendingNavigation, useDisplayedPathname,
} = await import("./pending-navigation");
const { AppTabViewHost } = await import("@/components/app-tab-view-host");

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

function Shell() {
  return <>
    <nav data-displayed={useDisplayedPathname()} />
    <AppTabViewHost><p data-page={h.pathname} /></AppTabViewHost>
  </>;
}
const render = () => act(() => root.render(<Shell />));
/** The router commits a route: the URL and `usePathname` move together. */
const commit = (pathname: string) => {
  window.history.pushState(null, "", pathname);
  h.pathname = pathname;
  render();
};
const displayed = () => host.querySelector("nav")!.getAttribute("data-displayed");
const skeleton = () => host.querySelector("[data-skeleton]")?.getAttribute("data-skeleton") ?? null;
const page = () => host.querySelector("[data-page]")?.getAttribute("data-page") ?? null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  window.history.replaceState(null, "", "/settings");
  h.pathname = "/settings";
  host = document.createElement("div");
  root = createRoot(host);
  render();
});
afterEach(() => {
  act(() => { clearPendingNavigation(); root.unmount(); });
  vi.useRealTimers();
});

it("shows a cold destination's skeleton and sidebar location before the router commits", () => {
  act(() => beginPendingNavigation("/trash?view=1"));
  expect(displayed()).toBe("/settings");
  act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS); });
  expect(displayed()).toBe("/trash");
  expect(skeleton()).toBe("/trash");
  expect(page()).toBeNull();

  commit("/trash");
  expect(displayed()).toBe("/trash");
  expect(skeleton()).toBeNull();
  expect(page()).toBe("/trash");
});

it("never shows the pending state for a destination that commits within the delay", () => {
  act(() => beginPendingNavigation("/trash"));
  commit("/trash");
  act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS * 2); });
  expect(skeleton()).toBeNull();
  expect(page()).toBe("/trash");
  // Coming back to the origin later must not revive the old destination.
  commit("/settings");
  expect(displayed()).toBe("/settings");
  expect(page()).toBe("/settings");
});

it("treats a change on the current pathname as an in-page update", () => {
  act(() => {
    beginPendingNavigation("/settings?tab=profile");
    vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS);
  });
  expect(displayed()).toBe("/settings");
  expect(page()).toBe("/settings");
});

it("renders the Home surface ahead instead of a skeleton", () => {
  act(() => {
    beginPendingNavigation("/home");
    vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS);
  });
  expect(displayed()).toBe("/home");
  expect(skeleton()).toBeNull();
  expect(page()).toBeNull();
  expect(host.querySelector("[data-retained-home-view]")?.getAttribute("data-app-view-active")).toBe("true");
});

it("releases the shell when the navigation never commits or history moves", () => {
  act(() => {
    beginPendingNavigation("/trash");
    vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS);
  });
  expect(skeleton()).toBe("/trash");
  act(() => { vi.advanceTimersByTime(PENDING_NAVIGATION_TIMEOUT_MS); });
  expect(skeleton()).toBeNull();
  expect(page()).toBe("/settings");

  act(() => {
    beginPendingNavigation("/inbox");
    vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS);
  });
  expect(skeleton()).toBe("/inbox");
  act(() => { window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(skeleton()).toBeNull();
  expect(displayed()).toBe("/settings");
});

it("switches at once from one pending destination to the next", () => {
  act(() => {
    beginPendingNavigation("/trash");
    vi.advanceTimersByTime(PENDING_NAVIGATION_DELAY_MS);
  });
  act(() => beginPendingNavigation("/inbox"));
  expect(skeleton()).toBe("/inbox");
  expect(displayed()).toBe("/inbox");
});
