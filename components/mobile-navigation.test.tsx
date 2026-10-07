// @vitest-environment jsdom
import { act, type MouseEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MobileNavigation, type MobileMenuPanel } from "./mobile-navigation";

const navigation = vi.hoisted(() => ({ visit: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/projects/aurora" }));
vi.mock("@/components/app-link", () => ({ default: ({ href, onClick, children, ...props }: {
  href: string; onClick?: () => void; children: ReactNode;
}) => <a {...props} href={href} onClick={(event: MouseEvent) => { event.preventDefault(); onClick?.(); navigation.visit(href); }}>{children}</a> }));
vi.mock("./mobile-nav-actions", () => ({ MobileNavActions: () => null }));
vi.mock("@/components/icon", () => ({ AppIcon: (props: { className?: string }) => <svg aria-hidden className={props.className} /> }));
vi.mock("mangue-ui", async () => ({
  ...await import("../node_modules/mangue-ui/src/components/ui/dialog"),
  ...await import("../node_modules/mangue-ui/src/components/ui/sheet"),
  ...await import("../node_modules/mangue-ui/src/components/ui/button"),
  ...await import("../node_modules/mangue-ui/src/lib/utils"),
}));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => true }));
let root: ReturnType<typeof createRoot>;
let container: HTMLDivElement;
beforeEach(() => {
  navigation.visit.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
});
afterEach(async () => { await act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

it("browses projects and resource levels without leaving the sheet until a final link is chosen", async () => {
  const branchAction = vi.fn();
  const objectives: MobileMenuPanel = { key: "beacon-objectives", title: "Objectives", sections: [{ items: [{ key: "overview", label: "All objectives", href: "/projects/beacon/objectives" }] }] };
  const beacon: MobileMenuPanel = { key: "beacon", title: "Beacon", sections: [{ items: [{ key: "objectives", label: "Objectives", href: "/projects/beacon/objectives", panel: objectives, onClick: branchAction }] }] };
  const aurora: MobileMenuPanel = { key: "aurora", title: "Aurora", icon: <svg data-project-icon />, sections: [{ items: [{ key: "board", label: "Tickets", href: "/projects/aurora" }] }] };
  await act(() => root.render(<NextIntlClientProvider locale="en" messages={{ Nav: { goTo: "Go to", home: "Home", searchPlaceholder: "Search" }, Common: { back: "Back", close: "Close" } }}>
    <MobileNavigation initialPanel={aurora} sections={[{ items: [{ key: "beacon", label: "Beacon", href: "/projects/beacon", panel: beacon, onClick: branchAction }] }]} menuFooter={null} onSearch={() => {}} />
  </NextIntlClientProvider>));
  const click = async (selector: string) => { await act(() => document.querySelector<HTMLElement>(selector)!.click()); };
  const dialog = () => document.querySelector('[role="dialog"]');
  await click("[data-mobile-menu-trigger]");
  expect(dialog()?.textContent).toContain("Aurora");
  expect(dialog()?.querySelector("[data-mobile-project-icon] [data-project-icon]")).not.toBeNull();
  await click('button[aria-label="Back"]');
  await click('[data-mobile-menu-branch="beacon"]');
  expect(dialog()?.textContent).toContain("Beacon");
  expect(document.activeElement?.textContent).toBe("Beacon");
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
  await click("[data-mobile-menu-trigger]");
  expect(dialog()?.textContent).toContain("Aurora");
  expect(dialog()?.textContent).not.toContain("Beacon");
});
