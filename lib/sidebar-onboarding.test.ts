// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dialog } from "mangue-ui";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { SidebarOnboarding } from "@/components/sidebar-onboarding";
import { resolveOnboardingState } from "@/lib/onboarding";

const mocks = vi.hoisted(() => ({
  checklist: {} as ReturnType<typeof import("@/lib/use-onboarding").useOnboardingChecklist>,
  projects: [] as Array<{ id: string; owner_id: string }>,
  createProject: vi.fn(), createIssue: vi.fn(), openNumo: vi.fn(),
  acknowledge: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn().mockResolvedValue(undefined),
  finish: vi.fn().mockResolvedValue(undefined), updateMetadata: vi.fn().mockResolvedValue(undefined),
}));
// Import only the primitives under test; the full barrel also loads unrelated emoji data.
vi.mock("mangue-ui", async () => ({
  ...await import("mangue-ui/components/ui/button"),
  ...await import("mangue-ui/components/ui/collapsible"),
  ...await import("mangue-ui/components/ui/popover"),
  ...await import("mangue-ui/components/ui/dropdown-menu"),
  ...await import("mangue-ui/components/ui/spinner"),
  ...await import("mangue-ui/components/ui/dialog"),
  ...await import("mangue-ui/lib/utils"),
  toast: { error: vi.fn() },
}));
vi.mock("@/lib/use-onboarding", () => ({ useOnboardingChecklist: () => mocks.checklist }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "user" }, updateUserMetadata: mocks.updateMetadata }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: mocks.projects, openCreateProject: mocks.createProject }) }));
vi.mock("@/lib/create-context", () => ({ useCreate: () => ({ openCreateIssue: mocks.createIssue }) }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ open: mocks.openNumo }) }));
vi.mock("@/lib/use-invitations-query", () => ({ useInvitationResponder: () => ({ invitations: [], busyId: null }) }));
vi.mock("@/lib/use-analytics", () => ({ useAnalytics: () => ({ track: vi.fn() }) }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("@/components/home/onboarding-import-dialog", () => ({ OnboardingImportDialog: () => null }));
vi.mock("@/components/home/onboarding-join-dialog", () => ({ OnboardingJoinDialog: () => null }));
vi.mock("@/components/app-link", () => ({ default: "a" }));

let root: Root;
let container: HTMLDivElement;
const button = (text: string) => [...document.querySelectorAll("button")].find((el) => el.textContent?.includes(text))!;
const click = async (text: string) => { await act(async () => button(text).click()); };

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  mocks.projects = [];
  mocks.checklist = {
    ...resolveOnboardingState({ meta: { onboarding_started: true, onboarding_version: 2 }, projectCount: 0, issueCount: 0, cyclesEnabled: false }),
    loading: false, finalScreen: false, showChecklist: true,
    acknowledgeStep: mocks.acknowledge, dismiss: mocks.dismiss, finish: mocks.finish,
  };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(createElement(NextIntlClientProvider, { locale: "en", messages, children: createElement(SidebarOnboarding) })));
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("sidebar onboarding interactions", () => {

  it("keeps guidance outside the navigation until a step is opened", async () => {
    expect(document.body.textContent).not.toContain(messages.Onboarding.numoDesc);
    await click("Discover Numo");
    expect(document.body.textContent).toContain(messages.Onboarding.numoDesc);
    expect(container.textContent).not.toContain(messages.Onboarding.numoDesc);
  });

  it("collapses the checklist without dismissing account progress", async () => {
    await click("Getting started");
    expect(button("Getting started").getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelector("ol")).toBeNull();
    expect(mocks.dismiss).not.toHaveBeenCalled();
  });

  it("opens Numo directly from a later step without creating a project", async () => {
    await click("Discover Numo");
    await click("Open Numo");
    expect(mocks.openNumo).toHaveBeenCalledWith({ projectId: null });
    expect(mocks.acknowledge).toHaveBeenCalledWith("numo");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("offers project creation when issues are selected without a project", async () => {
    await click("Add your first issue");
    expect(document.body.textContent).toContain("Create or join a project first");
    expect(button("Create an issue")).toBeUndefined();
    await click("Create a project");
    expect(mocks.createProject).toHaveBeenCalledOnce();
    expect(button("Skip this step")).toBeUndefined();
    await click("Add your first issue");
    await click("Skip this step");
    expect(mocks.acknowledge).toHaveBeenCalledWith("tickets");
  });

  it("uses the real account settings destination for coding agents", async () => {
    await click("Connect a coding agent");
    expect(document.querySelector("a")?.getAttribute("href")).toBe("/settings?tab=mcp");
    await click("Mark as done");
    expect(mocks.acknowledge).toHaveBeenCalledWith("mcp");
  });

  it("enables cycles through the account preference", async () => {
    await click("Plan with cycles");
    await click("Enable cycles");
    expect(mocks.updateMetadata).toHaveBeenCalledWith({ cycles_enabled: true });
  });

  it("closes the mobile menu when opening another surface", async () => {
    const closeMenu = vi.fn();
    act(() => root.render(createElement(NextIntlClientProvider, {
      locale: "en", messages, children: createElement(Dialog, {
        open: true, onOpenChange: closeMenu,
        children: createElement(SidebarOnboarding, { mobile: true }),
      }),
    })));
    await click("Discover Numo");
    await click("Open Numo");
    expect(closeMenu).toHaveBeenCalledWith(false);
    expect(mocks.openNumo).toHaveBeenCalledOnce();
  });

});
