// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppTabsProvider, useOptionalAppTabs, useOptionalAppTabNavigation, useOptionalAppTabSession } from "./app-tabs-context";

const state = vi.hoisted(() => ({ mobile: true as boolean | undefined, query: vi.fn(), replace: vi.fn() }));
vi.mock("./auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("./use-mobile-layout", () => ({ useMobileLayout: () => state.mobile }));
vi.mock("./use-app-tabs-query", () => ({ useAppTabsQuery: state.query, appTabsQueryKey: () => ["app-tabs"] }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/components/app-tab-route-sync", () => ({ AppTabRouteSync: () => null }));

let cleanup = async () => {};
afterEach(async () => { await cleanup(); vi.restoreAllMocks(); state.query.mockClear(); state.replace.mockClear(); });

async function mount() {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let contexts: unknown[] = [];
  function Page() {
    contexts = [useOptionalAppTabs(), useOptionalAppTabNavigation(), useOptionalAppTabSession()];
    return createElement("span", null, "Page content");
  }
  await act(() => root.render(createElement(AppTabsProvider, null, createElement(Page))));
  cleanup = async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); };
  return { container, contexts };
}

describe("mobile navigation isolation", () => {
  it("never reads account tabs or exposes tab mutation handles on mobile", async () => {
    state.mobile = true;
    const { container, contexts } = await mount();
    expect(container.textContent).toBe("Page content");
    expect(contexts).toEqual([null, null, null]);
    expect(state.query).not.toHaveBeenCalled();
  });
  it("does not mount desktop persistence before the viewport is known", async () => {
    state.mobile = undefined;
    await mount();
    expect(state.query).not.toHaveBeenCalled();
  });
  it("starts a reload at Home without restoring a desktop destination", async () => {
    state.mobile = true;
    window.history.replaceState(null, "", "/projects/example");
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "reload" } as PerformanceNavigationTiming]);
    await mount();
    expect(state.replace).toHaveBeenCalledWith("/home");
    expect(state.query).not.toHaveBeenCalled();
  });
  it("preserves an explicit incoming issue link", async () => {
    state.mobile = true;
    window.history.replaceState(null, "", "/projects/example?open=issue-id");
    vi.spyOn(performance, "getEntriesByType").mockReturnValue([{ type: "navigate" } as PerformanceNavigationTiming]);
    await mount();
    expect(state.replace).not.toHaveBeenCalled();
  });
});

it("waits for mobile editor saves and blocks a rejected departure", async () => {
  state.mobile = true;
  const { useAppTabDeparture } = await import("./app-tabs-context");
  const { useAppNavigation } = await import("./use-app-router");
  const navigate = vi.fn();
  let release!: (allowed: boolean) => void;
  let open!: ReturnType<typeof useAppNavigation>;
  function Editor() {
    useAppTabDeparture(() => new Promise<boolean>((resolve) => { release = resolve; }));
    open = useAppNavigation();
    return null;
  }
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  cleanup = async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); };
  await act(() => root.render(createElement(AppTabsProvider, null, createElement(Editor))));
  await act(async () => { open("/home", navigate); await Promise.resolve(); });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => { release(false); await Promise.resolve(); });
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => { open("/home", navigate); await Promise.resolve(); release(true); await Promise.resolve(); });
  expect(navigate).toHaveBeenCalledOnce();
  expect(state.query).not.toHaveBeenCalled();
});
