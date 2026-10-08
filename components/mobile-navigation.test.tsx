// @vitest-environment jsdom
import { act, useLayoutEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { SecondarySidebarProvider, useMobileSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileNavigation, type MobileMenuPanel } from "./mobile-navigation";

const navigation = vi.hoisted(() => ({ visit: vi.fn(), mobile: true }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/aurora" }));
vi.mock("@/components/app-link", () => ({ default: ({ href, onClick, children, ...props }: {
  href: string; onClick?: () => void; children: ReactNode;
}) => <a {...props} href={href} onClick={(event: MouseEvent) => { event.preventDefault(); onClick?.(); navigation.visit(href); }}>{children}</a> }));
vi.mock("./app-sidebar", () => ({
  SidebarFrame: ({ children, onNavigate, focusRef }: { children: ReactNode; onNavigate: () => void; focusRef: React.Ref<HTMLElement> }) => <aside ref={focusRef} tabIndex={-1} onClickCapture={(event) => { if ((event.target as Element).closest("a[href]")) onNavigate(); }}>{children}</aside>,
  SidebarTopBand: ({ onCreate, secondary, headerRef }: { onCreate: () => void; secondary: boolean; headerRef: React.Ref<HTMLDivElement> }) => <div><button hidden={secondary} onClick={onCreate}>New issue</button><div ref={headerRef} data-test-header hidden={!secondary} /></div>,
  SidebarBackRow: ({ label, onBack, ariaLabel }: { label: string; onBack: () => void; ariaLabel: string }) => <button aria-label={ariaLabel} onClick={onBack}>{label}</button>,
  ProjectContextRow: () => null,
  SidebarRows: ({ sections }: { sections: { items: { key: string; href?: string; label: string; onClick: () => void; browseKey?: string }[] }[] }) => sections.map((section, index) => <section key={index}>{section.items.map((item) => item.href
    ? <a key={item.key} href={item.href} onClick={(event) => { event.preventDefault(); navigation.visit(item.href); }}>{item.label}</a>
    : <button key={item.key} data-mobile-menu-branch={item.browseKey} onClick={item.onClick}><svg />{item.label}</button>)}</section>),
}));
vi.mock("./mobile-nav-actions", () => ({ MobileNavActions: () => null }));
vi.mock("@/components/icon", () => ({ AppIcon: (props: { className?: string }) => <svg aria-hidden className={props.className} /> }));
vi.mock("mangue-ui", async () => ({
  ...await import("../node_modules/mangue-ui/src/components/ui/dialog"),
  ...await import("../node_modules/mangue-ui/src/components/ui/sheet"),
  ...await import("../node_modules/mangue-ui/src/components/ui/button"),
  ...await import("../node_modules/mangue-ui/src/lib/utils"),
}));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => navigation.mobile }));
const activeElement = <T extends HTMLElement>(selector: string) => [...document.querySelectorAll<T>(selector)].find((node) => !node.closest("[inert]"))!;
const activePanel = () => activeElement<HTMLElement>("[data-mobile-sidebar-panel]");
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  navigation.visit.mockClear();
  navigation.mobile = true;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  container = document.createElement("div"); container.className = "app-workspace"; document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("browses projects and resource levels without leaving the sidebar until a final link is chosen", async () => {
  const branchAction = vi.fn();
  const objectives: MobileMenuPanel = { key: "beacon-objectives", title: "Objectives", sections: [{ items: [{ key: "overview", label: "All objectives", href: "/projects/beacon/objectives" }] }] };
  const beacon: MobileMenuPanel = { key: "beacon", title: "Beacon", sections: [{ items: [{ key: "objectives", label: "Objectives", href: "/projects/beacon/objectives", panel: objectives, onClick: branchAction }] }] };
  const aurora: MobileMenuPanel = { key: "aurora", title: "Aurora", sections: [{ items: [{ key: "board", label: "Tickets", href: "/projects/aurora" }] }] };
  await act(() => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation initialPanel={aurora} sections={[{ items: [{ key: "beacon", label: "Beacon", href: "/projects/beacon", panel: beacon, onClick: branchAction }] }]} onSearch={() => {}} />
  </NextIntlClientProvider></div>));
  const click = async (selector: string) => { await act(() => activeElement<HTMLElement>(selector).click()); };
  const dialog = () => document.querySelector('[role="dialog"]');
  await click("[data-mobile-menu-trigger]");
  expect(dialog()?.textContent).toContain("Aurora");
  expect(container.querySelector<HTMLElement>(".app-shell")?.inert).toBe(true);
  expect(dialog()?.querySelector('button[aria-label="Close"]')).toBeNull();
  await click('button[aria-label="Back"]');
  const outgoing = document.querySelector('[data-mobile-sidebar-panel="aurora"]')!.parentElement!;
  expect(outgoing.hasAttribute("inert")).toBe(true);
  expect(outgoing.getAttribute("aria-hidden")).toBe("true");
  expect(outgoing.style.pointerEvents).toBe("none");
  await click('[data-mobile-menu-branch="beacon"]');
  expect(dialog()?.textContent).toContain("Beacon");
  expect(document.activeElement).toBe(dialog()?.querySelector("aside"));
  expect(document.querySelector('[data-mobile-menu-branch="beacon-objectives"] svg')).not.toBeNull();
  await click('[data-mobile-menu-branch="beacon-objectives"]');
  expect(dialog()?.textContent).toContain("All objectives");
  expect(navigation.visit).not.toHaveBeenCalled();
  expect(branchAction).not.toHaveBeenCalled();
  await click('button[aria-label="Back"]');
  expect(dialog()?.textContent).toContain("Beacon");
  expect(navigation.visit).not.toHaveBeenCalled();
  await click('[data-mobile-menu-branch="beacon-objectives"]');
  await click('a[href="/projects/beacon/objectives"]');
  expect(navigation.visit).toHaveBeenCalledExactlyOnceWith("/projects/beacon/objectives");
  expect(dialog()).toBeNull();
  expect(container.querySelector<HTMLElement>(".app-shell")?.inert).toBe(false);
  expect(document.activeElement).toBe(document.querySelector("[data-mobile-menu-trigger]"));
  await click("[data-mobile-menu-trigger]");
  expect(dialog()?.textContent).toContain("Aurora");
  expect(activePanel()?.textContent).not.toContain("Beacon");
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(dialog()).toBeNull();
  expect(container.querySelector<HTMLElement>(".app-shell")?.inert).toBe(false);
});

it("restores the page and workspace when switching to desktop and back", async () => {
  const render = () => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation sections={[]} onSearch={() => {}} />
  </NextIntlClientProvider></div>);
  await act(render);
  const page = container.querySelector<HTMLElement>(".app-shell")!;
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  expect(page.inert).toBe(true);
  expect(container.hasAttribute("data-mobile-sidebar-workspace")).toBe(true);
  navigation.mobile = false;
  await act(render);
  expect(page.inert).toBe(false);
  expect(page.hasAttribute("data-mobile-sidebar-surface")).toBe(false);
  expect(container.hasAttribute("data-mobile-sidebar-workspace")).toBe(false);
  navigation.mobile = true;
  await act(render);
  expect(page.hasAttribute("data-mobile-sidebar-surface")).toBe(true);
  expect(container.hasAttribute("data-mobile-sidebar-workspace")).toBe(true);
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  expect(page.inert).toBe(true);
});

it("adopts a cold-loaded route panel without resetting deliberate browsing", async () => {
  let loadedPanels: MobileMenuPanel[] = [];
  const render = () => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation sections={[]} initialPanels={loadedPanels} onSearch={() => {}} />
  </NextIntlClientProvider></div>);
  await act(render);
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  loadedPanels = [{ key: "aurora", title: "Aurora", sections: [] }];
  await act(render);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Aurora");
  await act(() => activeElement<HTMLButtonElement>('button[aria-label="Back"]').click());
  loadedPanels = [...loadedPanels];
  await act(render);
  expect(activePanel()?.textContent).not.toContain("Aurora");
});


it("keeps route-owned portal controls mounted while browsing other levels and shares the header with only the active filter", async () => {
  const collection: MobileMenuPanel = { key: "collection", title: "Collection", sidebarRoute: "/projects/aurora" };
  const other: MobileMenuPanel = { key: "other", title: "Other", sections: [{ items: [{ key: "leaf", label: "Other destination", href: "/other" }] }] };
  function RouteList() {
    const secondary = useMobileSecondarySidebar()!;
    const [query, setQuery] = useState("");
    useLayoutEffect(() => secondary.register(), [secondary.register]);
    return secondary.mobileHost ? <>
      {createPortal(<input aria-label="Collection filter" value={query} onChange={(event) => setQuery(event.target.value)} />, secondary.mobileHost.header)}
      {createPortal(<button>Collection item</button>, secondary.mobileHost.body)}
    </> : null;
  }
  await act(() => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <SecondarySidebarProvider><RouteList /><MobileNavigation initialPanel={collection} sections={[{ items: [
      { key: "collection", label: "Collection", panel: collection }, { key: "other", label: "Other", panel: other },
    ] }]} onSearch={() => {}} /></SecondarySidebarProvider>
  </NextIntlClientProvider></div>));
  await act(() => activeElement<HTMLButtonElement>("[data-mobile-menu-trigger]").click());
  const originalInput = activeElement<HTMLInputElement>('input[aria-label="Collection filter"]');
  expect(originalInput).toBeDefined();
  originalInput.focus();
  await act(() => activeElement<HTMLButtonElement>('button[aria-label="Back"]').click());
  expect(originalInput.closest("[hidden][inert]")).not.toBeNull();
  await act(() => activeElement<HTMLButtonElement>('[data-mobile-menu-branch="other"]').click());
  expect(activeElement<HTMLInputElement>("input")).not.toBe(originalInput);
  expect(originalInput.closest("[hidden][inert]")).not.toBeNull();
  await act(() => activeElement<HTMLButtonElement>('button[aria-label="Back"]').click());
  await act(() => activeElement<HTMLButtonElement>('[data-mobile-menu-branch="collection"]').click());
  expect(activeElement<HTMLInputElement>('input[aria-label="Collection filter"]')).toBe(originalInput);
  expect(activeElement<HTMLElement>("[data-test-header]").querySelectorAll('input:not([inert] input)')).toHaveLength(1);
  expect(document.activeElement).toBe(document.querySelector('[role="dialog"] aside'));
  expect(navigation.visit).not.toHaveBeenCalled();
});
