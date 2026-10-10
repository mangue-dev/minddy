// @vitest-environment jsdom
import { act, createElement, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppLink from "@/components/app-link";
import { useAppNavigation, useAppRouter } from "./use-app-router";

const state = vi.hoisted(() => ({
  reuseDestination: vi.fn(() => true),
  hasSession: true,
  router: { push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => state.router }));
vi.mock("./app-tabs-context", () => ({
  useOptionalAppTabSession: () => state.hasSession ? { reuseDestination: state.reuseDestination } : null,
}));
vi.mock("./app-tab-session-context", () => ({
  useOptionalAppTabSession: () => state.hasSession ? { reuseDestination: state.reuseDestination } : null,
}));

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  state.hasSession = true;
  state.reuseDestination.mockReturnValue(true);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderLink(props: ComponentProps<typeof AppLink>) {
  const linkRouter = { ...state.router, pathname: "/home", asPath: "/home", query: {}, isReady: true } as unknown as NextRouter;
  await act(() => root.render(createElement(RouterContext.Provider, { value: linkRouter },
    createElement(AppLink, { ...props, prefetch: false }, "Open"))));
  return container.querySelector("a")!;
}
async function click(anchor: HTMLAnchorElement, options: MouseEventInit = {}) {
  const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...options });
  // Suppress jsdom's unimplemented browser navigation after React handles it.
  const cancelBrowser = (received: Event) => received.preventDefault();
  document.addEventListener("click", cancelBrowser, { once: true });
  await act(() => { anchor.dispatchEvent(event); });
}

describe("application navigation entry points", () => {
  it("reuses programmatic opening while preserving fallback options and local replacements", async () => {
    let router!: ReturnType<typeof useAppRouter>;
    let open!: ReturnType<typeof useAppNavigation>;
    function Caller() { router = useAppRouter(); open = useAppNavigation(); return null; }
    await act(() => root.render(createElement(Caller)));
    router.push("/pull-requests?pr=a", { scroll: false });
    expect(state.reuseDestination).toHaveBeenCalledWith("/pull-requests?pr=a");
    expect(state.router.push).not.toHaveBeenCalled();
    state.reuseDestination.mockReturnValue(false);
    router.push("/pull-requests?pr=b", { scroll: false });
    expect(state.router.push).toHaveBeenCalledWith("/pull-requests?pr=b", { scroll: false });
    const history = vi.fn();
    open("/projects/p/pages/a", history);
    expect(history).toHaveBeenCalledOnce();
    state.reuseDestination.mockClear();
    router.replace("/pull-requests", { scroll: false });
    expect(state.router.replace).toHaveBeenCalledWith("/pull-requests", { scroll: false });
    expect(state.reuseDestination).not.toHaveBeenCalled();
  });
  it("preserves ordinary routing without an application tab provider", async () => {
    state.hasSession = false;
    let router!: ReturnType<typeof useAppRouter>;
    function Caller() { router = useAppRouter(); return null; }
    await act(() => root.render(createElement(Caller)));
    router.push("/home");
    expect(state.router.push).toHaveBeenCalledWith("/home");
  });
  it("reuses an ordinary link using the rendered object-form destination", async () => {
    const onClick = vi.fn();
    const onNavigate = vi.fn();
    const anchor = await renderLink({ href: { pathname: "/pull-requests", query: { pr: "a" } }, onClick, onNavigate });
    await click(anchor);
    expect(onClick).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(state.reuseDestination).toHaveBeenCalledExactlyOnceWith("/pull-requests?pr=a");
  });
  it("keeps Next link navigation when no destination matches", async () => {
    state.reuseDestination.mockReturnValue(false);
    await click(await renderLink({ href: "/all", scroll: false }));
    expect(state.router.push).toHaveBeenCalledWith("/all", { scroll: false });
  });
  it.each([{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }])(
    "preserves modified link opening: %o", async (options) => {
      await click(await renderLink({ href: "/all" }), options);
      expect(state.reuseDestination).not.toHaveBeenCalled();
    },
  );
  it.each([{ target: "_blank" }, { download: true }, { href: "https://example.com/all" }])(
    "preserves explicit browser destinations: %o", async (props) => {
      await click(await renderLink({ href: "/all", ...props }));
      expect(state.reuseDestination).not.toHaveBeenCalled();
    },
  );
  it("honors custom click and navigation cancellation", async () => {
    await click(await renderLink({ href: "/all", onClick: (event) => event.preventDefault() }));
    expect(state.reuseDestination).not.toHaveBeenCalled();
    await click(await renderLink({ href: "/all", onNavigate: (event) => event.preventDefault() }));
    expect(state.reuseDestination).not.toHaveBeenCalled();
  });
});
