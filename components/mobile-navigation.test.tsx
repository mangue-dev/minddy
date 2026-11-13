// @vitest-environment jsdom
import { act, useLayoutEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { SecondarySidebarProvider, useMobileSecondarySidebar } from "@/lib/secondary-sidebar-context";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileNavigation, type MobileMenuPanel } from "./mobile-navigation";
import type { Project } from "@/lib/types";

const navigation = vi.hoisted(() => ({ visit: vi.fn(), mobile: true }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/aurora", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/components/app-link", () => ({ default: ({ href, onClick, children, ...props }: {
  href: string; onClick?: () => void; children: ReactNode;
}) => <a {...props} href={href} onClick={(event: MouseEvent) => { event.preventDefault(); onClick?.(); navigation.visit(href); }}>{children}</a> }));
vi.mock("./app-sidebar", () => ({
  SidebarFrame: ({ children, onNavigate, focusRef }: { children: ReactNode; onNavigate: () => void; focusRef: React.Ref<HTMLElement> }) => <aside ref={focusRef} tabIndex={-1} onClickCapture={(event) => { if ((event.target as Element).closest("a[href]")) onNavigate(); }}>{children}</aside>,
  SidebarRows: ({ sections }: { sections: { label?: string; items: { key: string; href?: string; label: string; onClick: () => void; browseKey?: string }[] }[] }) => sections.map((section, index) => <section key={index}>{section.label && <h2>{section.label}</h2>}{section.items.map((item) => item.href
    ? <a key={item.key} href={item.href} onClick={(event) => { event.preventDefault(); navigation.visit(item.href); }}>{item.label}</a>
    : <button key={item.key} data-mobile-menu-branch={item.browseKey} onClick={item.onClick}><svg />{item.label}</button>)}</section>),
}));
vi.mock("./mobile-nav-actions", () => ({
  MobileNumoButton: () => <button aria-label="Numo" />,
  MobileCreateButton: () => <button aria-label="New" />,
}));
// The picker's own sheet is search-select's concern: here, one button per option.
vi.mock("@/components/search-select", () => ({ SearchSelect: ({ trigger, options, onChange }: { trigger: ReactNode; options: { value: string; label: string }[]; onChange: (value: string) => void }) => <div data-test-picker>
  {trigger}{options.map((option) => <button key={option.value} data-test-option={option.value} onClick={() => onChange(option.value)}>{option.label}</button>)}
</div> }));
vi.mock("@/components/project-orb", () => ({ ProjectOrb: () => <span /> }));
vi.mock("@/components/icon", () => ({ AppIcon: (props: { className?: string }) => <svg aria-hidden className={props.className} /> }));
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

const messages = { Nav: { goTo: "Go to", home: "Home", projects: "Projects", settings: "Settings", switchProject: "Switch project", searchPlaceholder: "Search" }, Creation: { searchProject: "Search projects" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } };
const aurora = { id: "aurora", name: "Aurora" } as Project;

it("lists every destination on one level, under a picker of the projects' sections", async () => {
  const objectives: MobileMenuPanel = { key: "aurora-objectives", title: "Objectives", sidebarRoute: "/projects/aurora/objectives", sections: [] };
  const auroraPanel: MobileMenuPanel = { key: "project-aurora", title: "Aurora", project: aurora, sections: [{ items: [
    { key: "tickets", label: "Issues", href: "/projects/aurora", active: true },
    { key: "objectives", label: "Objectives", panel: objectives },
    { key: "settings", label: "Project settings", panel: { key: "settings-aurora", title: "Project settings", sidebarRoute: "/projects/aurora/settings" } },
  ] }] };
  const beaconPanel: MobileMenuPanel = { key: "project-beacon", title: "Beacon", project: { id: "beacon", name: "Beacon" } as Project, sections: [{ items: [
    { key: "tickets", label: "Issues", href: "/projects/beacon" },
  ] }] };
  await act(() => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={messages}>
    <MobileNavigation initialPanels={[auroraPanel]} sections={[
      { items: [{ key: "home", label: "Home", href: "/home" }, { key: "routines", label: "Routines", panel: { key: "routines", title: "Routines", sidebarRoute: "/routines" } }] },
      { items: [{ key: "project-aurora", label: "Aurora", href: "/projects/aurora", panel: auroraPanel }, { key: "project-beacon", label: "Beacon", href: "/projects/beacon", panel: beaconPanel },
        { key: "new-project", label: "New project" }] },
    ]} onSearch={() => {}} />
  </NextIntlClientProvider></div>));
  const dialog = () => document.querySelector('[role="dialog"]');
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  // The current project's sections, as links, the page's own one marked.
  const tiles = [...document.querySelectorAll<HTMLAnchorElement>("[data-mobile-project-tiles] a")];
  expect(tiles.map((tile) => [tile.textContent, tile.getAttribute("href")])).toEqual([
    ["Issues", "/projects/aurora"], ["Objectives", "/projects/aurora/objectives"], ["Settings", "/projects/aurora/settings"],
  ]);
  expect(tiles[0].getAttribute("aria-current")).toBe("page");
  // Nothing opens a level below, and the projects are in the picker only.
  expect(dialog()?.querySelector("[data-mobile-menu-branch], button[aria-label=\"Back\"]")).toBeNull();
  expect(dialog()?.querySelector("[data-mobile-project-picker]")?.textContent).toContain("Aurora");
  expect(dialog()?.querySelectorAll('[data-sidebar-navigation-item], a[href="/projects/beacon"]')).toHaveLength(3);
  expect(dialog()?.textContent).not.toContain("New project");
  // Without a list of its own, the page gives the sheet no second tab.
  expect(document.querySelector("[data-mobile-nav-tabs]")).toBeNull();
  // Picking a project changes the tiles, not the page.
  await act(() => activeElement<HTMLButtonElement>('[data-test-option="beacon"]').click());
  expect([...document.querySelectorAll<HTMLAnchorElement>("[data-mobile-project-tiles] a")].map((tile) => tile.getAttribute("href"))).toEqual(["/projects/beacon"]);
  expect(navigation.visit).not.toHaveBeenCalled();
  await act(() => activeElement<HTMLAnchorElement>('a[href="/projects/beacon"]').click());
  expect(navigation.visit).toHaveBeenCalledExactlyOnceWith("/projects/beacon");
  expect(dialog()).toBeNull();
  // The next opening starts again on the page's project.
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  expect(document.querySelector("[data-mobile-project-picker]")?.textContent).toContain("Aurora");
  await act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  await act(() => activeElement<HTMLAnchorElement>('a[href="/routines"]').click());
  expect(navigation.visit).toHaveBeenLastCalledWith("/routines");
});

it("holds the page's own list in a second tab, and opens on it", async () => {
  const collection: MobileMenuPanel = { key: "collection", title: "Collection", sidebarRoute: "/projects/aurora" };
  function RouteList() {
    const secondary = useMobileSecondarySidebar()!;
    const [query, setQuery] = useState("");
    useLayoutEffect(() => secondary.register(), [secondary.register]);
    return secondary.mobileHost ? <>
      {createPortal(<input aria-label="Collection filter" value={query} onChange={(event) => setQuery(event.target.value)} />, secondary.mobileHost.header)}
      {createPortal(<button>Collection item</button>, secondary.mobileHost.body)}
    </> : null;
  }
  await act(() => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={messages}>
    <SecondarySidebarProvider><RouteList /><MobileNavigation initialPanel={collection} sections={[{ items: [{ key: "home", label: "Home", href: "/home" }] }]} onSearch={() => {}} /></SecondarySidebarProvider>
  </NextIntlClientProvider></div>));
  const open = () => act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  const tab = (label: string) => [...document.querySelectorAll<HTMLButtonElement>("[data-mobile-nav-tabs] button")].find((button) => button.textContent === label)!;
  await open();
  expect(activePanel().dataset.mobileSidebarPanel).toBe("page");
  expect(activePanel().textContent).toContain("Collection item");
  // The route's list stays mounted while Go to shows: the page keeps its state.
  const input = activeElement<HTMLInputElement>('input[aria-label="Collection filter"]');
  await act(() => tab("Go to").click());
  expect(activePanel().dataset.mobileSidebarPanel).toBe("goTo");
  expect(input.closest("[inert]")).not.toBeNull();
  await act(() => document.activeElement!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  // Each opening starts again on the page's list.
  await open();
  expect(activePanel().dataset.mobileSidebarPanel).toBe("page");
  expect(navigation.visit).not.toHaveBeenCalled();
});

it("orders the bottom bar as the menu, search, the inbox, Numo and New", async () => {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", inbox: "Inbox", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation sections={[]} inboxCount={2} inboxBadgeLabel="2 unread items" onSearch={() => {}} />
  </NextIntlClientProvider>));
  const bar = container.querySelector("[data-mobile-navigation]")!;
  expect([...bar.querySelectorAll("a, button")].map((control) => control.getAttribute("aria-label")))
    .toEqual(["Go to", "Search", "Inbox — 2 unread items", "Numo", "New"]);
  expect(bar.querySelector('[data-nav-slot="inbox"]')?.hasAttribute("data-nav-badge")).toBe(true);
  expect(bar.querySelector('a[href="/home"]')).toBeNull();
});

it("leaves the inbox slot without a badge when nothing waits", async () => {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", inbox: "Inbox", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation sections={[]} onSearch={() => {}} />
  </NextIntlClientProvider>));
  const inbox = container.querySelector('[data-nav-slot="inbox"]')!;
  expect(inbox.getAttribute("aria-label")).toBe("Inbox");
  expect(inbox.hasAttribute("data-nav-badge")).toBe(false);
});

it("gives the bar's buttons no focus style of their own", async () => {
  // The focus returns by script once a sheet closes; on a touch screen the
  // browser counts it as visible focus, so a `focus-visible:` style painted
  // the button gray. Keyboard focus comes from the global ring instead.
  await act(() => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", inbox: "Inbox", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation sections={[]} onSearch={() => {}} />
  </NextIntlClientProvider></div>));
  const slots = [...container.querySelectorAll<HTMLButtonElement>("[data-mobile-navigation] button")];
  expect(slots.length).toBeGreaterThan(1);
  for (const slot of slots) expect(slot.className).not.toMatch(/focus-visible:/);
});

it("shows the bar again when a sheet leaves with the field that had the focus", async () => {
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", inbox: "Inbox", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close", clearFilter: "Clear filter" }, Settings: { filterPlaceholder: "Filter {count} items" } }}>
    <MobileNavigation sections={[]} onSearch={() => {}} />
  </NextIntlClientProvider>));
  const bar = container.querySelector("[data-mobile-navigation]")!;
  const layer = document.body.appendChild(document.createElement("div"));
  const field = layer.appendChild(document.createElement("input"));
  await act(async () => { field.focus(); await Promise.resolve(); });
  expect(bar.hasAttribute("data-typing")).toBe(true);
  // WebKit sends no focusout when the focused field is removed.
  await act(async () => { layer.remove(); await new Promise((resolve) => setTimeout(resolve, 0)); });
  expect(bar.hasAttribute("data-typing")).toBe(false);
});
