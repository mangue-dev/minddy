// @vitest-environment jsdom
import { act, createElement, StrictMode, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AppLink from "./app-link";
import { SessionContext } from "@/lib/app-tab-session-context";
import { MobileNavigationContext } from "@/lib/mobile-navigation-context";
import type { AppTabsSession } from "@/lib/app-tabs-session";
import { navigationPreparationPriority } from "@/lib/navigation-preparation-priority";
import { createRoutePrefetchAdmission, RoutePrefetchAdmissionContext, type RoutePrefetchAdmission } from "@/lib/route-prefetch-admission-context";
import { isDefaultInternalRoutePrefetch } from "@/lib/use-route-prefetch-admission";

const observed = vi.hoisted(() => ({ props: {} as Record<string, unknown>, renders: 0,
  push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: observed.push, replace: observed.replace }) }));
vi.mock("next/link", () => ({ default: (props: Record<string, unknown>) => {
  observed.props = props; observed.renders++;
  const { prefetch: _prefetch, onNavigate: _onNavigate, as: _as, legacyBehavior: _legacy,
    replace: _replace, scroll: _scroll, href, children, ...anchor } = props;
  return createElement("a", { ...anchor, href: typeof href === "string" ? href : "/object-href" }, children as ReactNode);
} }));

let root: Root, container: HTMLDivElement;
const clients: QueryClient[] = [];
const client = () => { const value = new QueryClient(); clients.push(value); return value; };
const session = () => ({ prefetch: vi.fn(), reuseDestination: vi.fn(() => false), activate: vi.fn(), create: vi.fn() });
type Session = ReturnType<typeof session>;
beforeEach(() => {
  vi.clearAllMocks(); observed.props = {}; observed.renders = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Admission observation must not issue a request"); }));
  window.history.replaceState(null, "", "/home");
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  clients.splice(0).forEach((value) => value.clear()); vi.unstubAllGlobals();
});
async function render(gate: RoutePrefetchAdmission | null, owner: Session | null,
  props: ComponentProps<typeof AppLink> = { href: "/all" }, mobile: { open: (navigate: () => void) => void; registerDeparture: () => () => void } | null = null) {
  await act(async () => root.render(createElement(StrictMode, null,
    createElement(RoutePrefetchAdmissionContext.Provider, { value: gate },
      createElement(SessionContext.Provider, { value: owner as unknown as AppTabsSession | null },
        createElement(MobileNavigationContext.Provider, { value: mobile }, createElement(AppLink, props, "Destination")))))));
}

describe("default route prefetch admission", () => {
  it("starts closed before session initialization and observes only the existing lifecycle", async () => {
    const value = client(), gate = createRoutePrefetchAdmission(value), priority = navigationPreparationPriority(value);
    await render(gate, null); expect(observed.props.prefetch).toBe(false);
    await render(gate, null, { href: "/all", prefetch: undefined }); expect(observed.props.prefetch).toBe(false);
    await act(async () => { priority.acquire(); gate.observeLifecycle(); });
    expect(observed.props.prefetch).toBe(false);
    expect(value.getQueryCache().getAll()).toHaveLength(0); expect(value.isFetching()).toBe(0);
    expect(fetch).not.toHaveBeenCalled();
    await act(async () => priority.release()); expect(observed.props.prefetch).toBeUndefined();
  });

  it("uses the closed initial app snapshot during server rendering while public links remain ordinary", () => {
    const gate = createRoutePrefetchAdmission(client());
    renderToString(createElement(RoutePrefetchAdmissionContext.Provider, { value: gate }, createElement(AppLink, { href: "/all" })));
    expect(observed.props.prefetch).toBe(false);
    renderToString(createElement(AppLink, { href: "/all" })); expect(observed.props.prefetch).toBeUndefined();
  });

  it("opens after an already released startup lifetime and waits for subsequent existing owners", async () => {
    const value = client(), gate = createRoutePrefetchAdmission(value), owner = session();
    const first = navigationPreparationPriority(value), second = navigationPreparationPriority(value);
    await render(gate, owner); expect(observed.props.prefetch).toBe(false);
    await act(async () => gate.observeLifecycle()); expect(observed.props.prefetch).toBeUndefined();
    await act(async () => { first.acquire(); second.acquire(); }); expect(observed.props.prefetch).toBe(false);
    const renders = observed.renders, key = ["issues", "project"];
    await act(async () => { first.startRead(key); first.finishRead(key); }); expect(observed.renders).toBe(renders);
    await act(async () => first.release()); expect(observed.props.prefetch).toBe(false);
    await act(async () => second.release()); expect(observed.props.prefetch).toBeUndefined();
    expect(owner.activate).not.toHaveBeenCalled(); expect(owner.create).not.toHaveBeenCalled();
    expect(owner.prefetch).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { href: "/all", prefetch: true }, { href: "/all", prefetch: false }, { href: "/all", prefetch: null },
    { href: "/all", prefetch: "auto" as const }, { href: "https://example.test/all" }, { href: "//example.test/all" },
    { href: { pathname: "/all" } }, { href: "/en/documentation" }, { href: "/all", target: "_blank" },
    { href: "/all", target: "_self" }, { href: "/all", download: true }, { href: "/all", download: false },
    { href: "/all", as: "/rewritten" }, { href: "/all", as: "" },
    { href: "/all", legacyBehavior: true }, { href: "/all", legacyBehavior: false },
  ])("preserves explicit or nonstandard Link behavior: %j", async (props) => {
    const owner = session(); await render(createRoutePrefetchAdmission(client()), owner, props);
    expect(observed.props.prefetch).toBe("prefetch" in props ? props.prefetch : undefined);
    await act(async () => { container.querySelector("a")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(owner.prefetch).not.toHaveBeenCalled();
  });

  it("leaves public links and known mobile navigation ungated", async () => {
    await render(null, null); expect(observed.props.prefetch).toBeUndefined();
    const mobile = { open: vi.fn(), registerDeparture: () => () => {} };
    await render(createRoutePrefetchAdmission(client()), session(), { href: "/all" }, mobile);
    expect(observed.props.prefetch).toBeUndefined(); expect(fetch).not.toHaveBeenCalled();
  });

  it("closes a replacement lifetime and ignores notifications from the retired client", async () => {
    const old = client(), replacement = client(), first = navigationPreparationPriority(old), second = navigationPreparationPriority(replacement);
    const oldGate = createRoutePrefetchAdmission(old), gate = createRoutePrefetchAdmission(replacement);
    oldGate.observeLifecycle(); await render(oldGate, session()); expect(observed.props.prefetch).toBeUndefined();
    await render(gate, session()); expect(observed.props.prefetch).toBe(false);
    const renders = observed.renders;
    await act(async () => { first.acquire(); first.release(); }); expect(observed.renders).toBe(renders);
    await act(async () => { second.acquire(); gate.observeLifecycle(); }); expect(observed.props.prefetch).toBe(false);
    await act(async () => second.release()); expect(observed.props.prefetch).toBeUndefined();
  });

  it("composes real mouse, focus and touch intent after caller handlers", async () => {
    const owner = session(), order: string[] = [];
    owner.prefetch.mockImplementation(() => { order.push("session"); });
    const mouse = vi.fn(() => { order.push("mouse"); }), focus = vi.fn(() => { order.push("focus"); }), touch = vi.fn(() => { order.push("touch"); });
    const gate = createRoutePrefetchAdmission(client());
    await render(gate, owner, { href: "/routines", onMouseEnter: mouse, onFocus: focus, onTouchStart: touch });
    const anchor = container.querySelector("a")!;
    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      anchor.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      anchor.dispatchEvent(new Event("touchstart", { bubbles: true }));
    });
    expect(order).toEqual(["mouse", "session", "focus", "session", "touch", "session"]);
    expect(owner.prefetch.mock.calls).toEqual([["/routines"], ["/routines"], ["/routines"]]);
    expect(owner.activate).not.toHaveBeenCalled(); expect(owner.create).not.toHaveBeenCalled();
    expect(observed.push).not.toHaveBeenCalled(); expect(observed.replace).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
    await act(async () => gate.observeLifecycle());
    await act(async () => { anchor.dispatchEvent(new FocusEvent("focusin", { bubbles: true })); });
    expect(owner.prefetch).toHaveBeenCalledTimes(3);
  });

  it("honors caller cancellation for every intent and preserves cold navigation fallback", async () => {
    const owner = session();
    await render(createRoutePrefetchAdmission(client()), owner, { href: "/pull-requests",
      onMouseEnter: (event) => event.preventDefault(), onFocus: (event) => event.preventDefault(), onTouchStart: (event) => event.preventDefault() });
    const anchor = container.querySelector("a")!;
    await act(async () => {
      anchor.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true }));
      anchor.dispatchEvent(new FocusEvent("focusin", { bubbles: true, cancelable: true }));
      anchor.dispatchEvent(new Event("touchstart", { bubbles: true, cancelable: true }));
    });
    expect(owner.prefetch).not.toHaveBeenCalled();
    const preventDefault = vi.fn();
    (observed.props.onClick as (event: { currentTarget: HTMLAnchorElement }) => void)({ currentTarget: anchor });
    (observed.props.onNavigate as (event: { preventDefault: () => void }) => void)({ preventDefault });
    expect(owner.reuseDestination).toHaveBeenCalledExactlyOnceWith("/pull-requests");
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it("preserves the caller navigation guard before tab reuse", async () => {
    const owner = session();
    await render(createRoutePrefetchAdmission(client()), owner, { href: "/all", onNavigate: (event) => event.preventDefault() });
    const preventDefault = vi.fn();
    (observed.props.onClick as (event: { currentTarget: HTMLAnchorElement }) => void)({ currentTarget: container.querySelector("a")! });
    (observed.props.onNavigate as (event: { preventDefault: () => void }) => void)({ preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(owner.reuseDestination).not.toHaveBeenCalled();
  });

  it("preserves prepared tab reuse and the mobile departure callback", async () => {
    const owner = session(); owner.reuseDestination.mockReturnValue(true);
    await render(createRoutePrefetchAdmission(client()), owner, { href: "/all" });
    const click = () => (observed.props.onClick as (event: { currentTarget: HTMLAnchorElement }) => void)({ currentTarget: container.querySelector("a")! });
    const navigate = (preventDefault: () => void) => (observed.props.onNavigate as (event: { preventDefault: () => void }) => void)({ preventDefault });
    const reused = vi.fn(); click(); navigate(reused);
    expect(reused).toHaveBeenCalledOnce(); expect(owner.reuseDestination).toHaveBeenCalledExactlyOnceWith("/all");
    const mobile = { open: vi.fn(), registerDeparture: () => () => {} };
    await render(null, owner, { href: "/projects/project/pages/page", replace: true, scroll: false }, mobile);
    const prevented = vi.fn(); click(); navigate(prevented);
    expect(prevented).toHaveBeenCalledOnce(); expect(mobile.open).toHaveBeenCalledOnce();
    expect(observed.replace).not.toHaveBeenCalled();
    (mobile.open.mock.calls[0][0] as () => void)();
    expect(observed.replace).toHaveBeenCalledExactlyOnceWith("/projects/project/pages/page", { scroll: false });
    expect(owner.reuseDestination).toHaveBeenCalledOnce();
  });

  it("recognizes only omitted or undefined prefetch on safe existing app destinations", () => {
    expect(isDefaultInternalRoutePrefetch("/home", undefined)).toBe(true);
    for (const prefetch of [true, false, null, "auto"]) expect(isDefaultInternalRoutePrefetch("/home", prefetch)).toBe(false);
    for (const href of ["https://example.test/home", "//example.test/home", { pathname: "/home" }, "/public-page", "/all\\redirect"]) {
      expect(isDefaultInternalRoutePrefetch(href, undefined)).toBe(false);
    }
  });
});
