// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppTabStrip } from "@/components/app-tab-strip";

const mocks = vi.hoisted(() => {
  const session = {
    getActiveHref: () => null, activate: vi.fn(), close: vi.fn(() => Promise.resolve()), prefetch: vi.fn(),
    update: vi.fn(), move: vi.fn(), retry: vi.fn(), goHome: vi.fn(), getSnapshot: () => ({ activeId: "home-tab" }),
  };
  const tabs = [
    { id: "home-tab", href: "/home", pinned: false, custom_name: null },
    { id: "inbox-tab", href: "/inbox", pinned: false, custom_name: null },
  ];
  return {
    unread: 0,
    renders: new Map<string, number>(),
    tabsValue: { tabs, activeId: "home-tab", session, busy: false, error: null, loading: false, loadError: false, reload: vi.fn() },
    none: [] as never[],
    noCounts: {},
    projects: { projects: [] as never[] },
    metadata: { pageById: new Map(), objectiveById: new Map(), prById: new Map(), routineById: new Map(), issueById: new Map() },
  };
});

vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} unobserve() {} });
vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/app-tabs-context", () => ({ useAppTabs: () => mocks.tabsValue }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => mocks.projects }));
vi.mock("@/lib/use-app-tab-metadata", () => ({ useAppTabMetadata: () => mocks.metadata }));
vi.mock("@/lib/use-agent-runs", () => ({ useOpenPullRequestCountQuery: () => 0 }));
vi.mock("@/lib/use-billing-query", () => ({ usePlanGates: () => ({ agentsAllowed: true }) }));
vi.mock("@/lib/use-notifications", () => ({ useNotifications: () => ({ unreadCount: mocks.unread }) }));
vi.mock("@/lib/use-invitations-query", () => ({ useMyInvitations: () => ({ invitations: mocks.none }) }));
vi.mock("@/lib/use-smart-assign-warnings-query", () => ({ useSmartAssignWarningsQuery: () => ({ warnings: mocks.none }) }));
vi.mock("@/lib/use-triage-counts-query", () => ({ useTriageCountsQuery: () => ({ counts: mocks.noCounts }) }));
vi.mock("@/lib/keyboard/use-mod-shortcut", () => ({ useModKey: () => "⌘" }));
vi.mock("@/lib/use-drag-announcements", () => ({ useDragAnnouncements: () => ({}), useStripInstructions: () => ({ draggable: "" }) }));
vi.mock("@/lib/app-tab-location", () => ({ appTabRoute: (href: string) => ({ section: href.slice(1) }) }));
vi.mock("@/components/drag-cursor", () => ({ DragCursor: () => null }));
vi.mock("@/components/app-tab-icon", () => ({ AppTabIcon: () => null }));
vi.mock("@/components/app-tab-item", () => ({
  AppTabItem: ({ tab, label, badge, onActivate, onClose }: {
    tab: { id: string }; label: string; badge?: ReactNode; onActivate: () => void; onClose: () => void;
  }) => {
    mocks.renders.set(tab.id, (mocks.renders.get(tab.id) ?? 0) + 1);
    return <div>
      <button type="button" role="tab" data-app-tab-id={tab.id} onClick={onActivate}>{label}{badge}</button>
      <button type="button" data-close={tab.id} onClick={onClose}>close</button>
    </div>;
  },
}));

let container: HTMLDivElement;
let root: Root;
const render = () => act(async () => root.render(
  <TooltipProvider><AppTabStrip onNewTab={() => {}} /></TooltipProvider>,
));

beforeEach(() => {
  mocks.unread = 0;
  mocks.renders.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it("re-renders only the tab whose badge changed when the strip updates (MIN-875)", async () => {
  await render();
  const home = mocks.renders.get("home-tab");
  const inbox = mocks.renders.get("inbox-tab");
  expect(container.querySelector('[aria-label="inboxBadge"]')).toBeNull();

  // An unrelated strip update (same values) leaves every tab alone.
  await render();
  expect(mocks.renders.get("home-tab")).toBe(home);
  expect(mocks.renders.get("inbox-tab")).toBe(inbox);

  // A new unread notification only concerns the Inbox tab's badge.
  mocks.unread = 3;
  await render();
  expect(mocks.renders.get("home-tab")).toBe(home);
  expect(mocks.renders.get("inbox-tab")).toBe((inbox ?? 0) + 1);
  expect(container.querySelector('[data-app-tab-id="inbox-tab"] [aria-label="inboxBadge"]')).not.toBeNull();
});

it("keeps each memoized tab acting on its own tab", async () => {
  await render();
  mocks.unread = 1;
  await render();
  await act(async () => container.querySelector<HTMLElement>('[data-app-tab-id="inbox-tab"]')?.click());
  expect(mocks.tabsValue.session.activate).toHaveBeenLastCalledWith("inbox-tab");
  await act(async () => container.querySelector<HTMLElement>('[data-close="home-tab"]')?.click());
  expect(mocks.tabsValue.session.close).toHaveBeenLastCalledWith("home-tab");
});
