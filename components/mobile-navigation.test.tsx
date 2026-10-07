// @vitest-environment jsdom
import { act, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
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
  SidebarTopBand: ({ onCreate }: { onCreate: () => void }) => <button onClick={onCreate}>New issue</button>,
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
  await act(() => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close" } }}>
    <MobileNavigation initialPanel={aurora} sections={[{ items: [{ key: "beacon", label: "Beacon", href: "/projects/beacon", panel: beacon, onClick: branchAction }] }]} onSearch={() => {}} />
  </NextIntlClientProvider></div>));
  const click = async (selector: string) => { await act(() => document.querySelector<HTMLElement>(selector)!.click()); };
  const dialog = () => document.querySelector('[role="dialog"]');
  await click("[data-mobile-menu-trigger]");
  expect(dialog()?.textContent).toContain("Aurora");
  expect(container.querySelector<HTMLElement>(".app-shell")?.inert).toBe(true);
  expect(dialog()?.querySelector('button[aria-label="Close"]')).toBeNull();
  await click('button[aria-label="Back"]');
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
  expect(dialog()?.textContent).not.toContain("Beacon");
  await act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(dialog()).toBeNull();
  expect(container.querySelector<HTMLElement>(".app-shell")?.inert).toBe(false);
});

it("restores the page and workspace when switching to desktop and back", async () => {
  const render = () => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close" } }}>
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
  const render = () => root.render(<div className="app-shell"><NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close" } }}>
    <MobileNavigation sections={[]} initialPanels={loadedPanels} onSearch={() => {}} />
  </NextIntlClientProvider></div>);
  await act(render);
  await act(() => container.querySelector<HTMLButtonElement>("[data-mobile-menu-trigger]")!.click());
  loadedPanels = [{ key: "aurora", title: "Aurora", sections: [] }];
  await act(render);
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Aurora");
  await act(() => document.querySelector<HTMLButtonElement>('button[aria-label="Back"]')!.click());
  loadedPanels = [...loadedPanels];
  await act(render);
  expect(document.querySelector('[role="dialog"]')?.textContent).not.toContain("Aurora");
});
