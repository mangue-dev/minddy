// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsShell } from "./settings-shell";

const replace = vi.hoisted(() => vi.fn());
const trackEvent = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({ value: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/settings",
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("framer-motion", () => ({ useReducedMotion: () => false }));
vi.mock("@/lib/analytics", () => ({ trackEvent }));
vi.mock("@/components/icon", () => ({ AppIcon: () => null }));
vi.mock("@/components/app-content-header", () => ({ AppContentHeader: () => null }));
vi.mock("@/components/secondary-sidebar", () => ({
  CollectionSidebar: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/lib/mobile-collection-state", () => ({
  useMobileCollectionState: (_path: string, _slot: string, initial: string) => [initial, () => {}],
}));
vi.mock("@/lib/use-scroll-fade", () => ({ useScrollFade: () => ({ ref: { current: null }, scrollProps: {} }) }));
vi.mock("@/lib/settings-sections", () => ({
  SETTINGS_SECTION_PARAM: "section",
  settingsSectionAnchor: (id: string) => id,
  settingsSectionHref: () => "/settings",
  useSettingsSections: () => [],
}));
vi.mock("@/lib/settings-section-focus", () => ({ takeSettingsSectionFocus: () => null }));
vi.mock("@/components/sidebar-filter-field", () => ({ matchesFilter: () => false }));
vi.mock("@/lib/app-tab-route-context", () => ({
  AppTabRouteBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAppTabRoute: () => ({ pathname: "/settings", searchParams: new URLSearchParams(search.value) }),
}));
vi.mock("@/components/sidebar-nav-rail", () => ({
  SidebarNavRail: ({ items, onValueChange }: { items: { value: string; label: string }[]; onValueChange: (v: string) => void }) => (
    <div>{items.map((item) => <button key={item.value} onClick={() => onValueChange(item.value)}>{item.label}</button>)}</div>
  ),
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  replace.mockClear();
  trackEvent.mockClear();
  search.value = "";
  window.history.replaceState(null, "", "/settings");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = () => act(() => root.render(
  <SettingsShell
    title="Settings"
    defaultTab="general"
    filterPlaceholder={() => "Filter"}
    tabs={[
      { value: "general", label: "General", content: "general content" },
      { value: "inbox", label: "Inbox", content: "inbox content" },
    ]}
  />,
));

describe("SettingsShell tab switching", () => {
  it("rewrites the query in place instead of asking the router for a server round trip", () => {
    render();
    const spy = vi.spyOn(window.history, "replaceState");
    act(() => host.querySelectorAll("button")[1].click());
    expect(spy).toHaveBeenCalledWith(null, "", "/settings?tab=inbox");
    expect(replace).not.toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("settings_tab_switched", { scope: "account", tab: "inbox" });
  });

  it("omits the default tab from the URL", () => {
    search.value = "tab=inbox";
    window.history.replaceState(null, "", "/settings?tab=inbox");
    render();
    act(() => host.querySelectorAll("button")[0].click());
    expect(window.location.search).toBe("");
    expect(replace).not.toHaveBeenCalled();
  });
});
