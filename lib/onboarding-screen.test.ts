// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/messages/en.json";
import { OnboardingScreen } from "@/components/first-run/onboarding-screen";
import { FirstRunGate } from "@/components/first-run/first-run-gate";
import { resolveOnboardingState } from "@/lib/onboarding";

const mocks = vi.hoisted(() => ({
  checklist: {} as ReturnType<typeof import("@/lib/use-onboarding").useOnboardingChecklist>,
  projects: [] as Array<{ id: string; owner_id: string }>,
  mobile: false,
  pathname: "/home",
  user: { id: "user", created_at: "2026-11-20T10:00:00Z", user_metadata: { profile_setup_done: true } } as Record<string, unknown>,
  createProject: vi.fn(), createIssue: vi.fn(), openNumo: vi.fn(), push: vi.fn(),
  acknowledge: vi.fn().mockResolvedValue(undefined), dismiss: vi.fn().mockResolvedValue(undefined),
  finish: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  toast: { error: vi.fn() },
}));
// The gate loads its screens lazily; the test renders them synchronously.
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<unknown>) => {
    const source = load.toString();
    return function Lazy() {
      if (source.includes("onboarding-screen")) return createElement("div", { "data-testid": "tour" });
      if (source.includes("profile-setup-screen")) return createElement("div", { "data-testid": "profile" });
      return null;
    };
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), usePathname: () => mocks.pathname }));
vi.mock("@/lib/use-mobile-layout", () => ({ useMobileLayout: () => mocks.mobile }));
vi.mock("@/lib/use-onboarding", () => ({ useOnboardingChecklist: () => mocks.checklist }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: mocks.projects, openCreateProject: mocks.createProject }) }));
vi.mock("@/lib/create-context", () => ({ useCreate: () => ({ openCreateIssue: mocks.createIssue }) }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ open: mocks.openNumo }) }));
vi.mock("@/lib/use-invitations-query", () => ({ useInvitationResponder: () => ({ invitations: [], busyId: null, answer: vi.fn() }) }));
vi.mock("@/lib/mobile/use-keyboard-frame", () => ({ useKeyboardFrame: () => ({ height: null }), keyboardFrameStyle: () => ({}) }));
vi.mock("@/components/home/onboarding-join-dialog", () => ({ OnboardingJoinDialog: () => null }));
vi.mock("@/components/first-run/confetti-burst", () => ({ ConfettiBurst: () => null }));
vi.mock("@/components/first-run/profile-setup-screen", () => ({ ProfileSetupScreen: () => null }));
vi.mock("@/components/settings/mcp-connect-panel", () => ({
  McpConnectPanel: ({ layout }: { layout: string }) => createElement("div", { "data-testid": "mcp-panel", "data-layout": layout }),
}));

let root: Root;
let container: HTMLDivElement;
const button = (text: string) => [...document.querySelectorAll("button")].find((el) => el.textContent?.trim() === text);
const click = async (text: string) => { await act(async () => button(text)!.click()); };
const render = (element: ReturnType<typeof createElement>) =>
  act(() => root.render(createElement(NextIntlClientProvider, { locale: "en", messages, children: element })));

function checklistAt(meta: Record<string, unknown>, projectCount = 0) {
  mocks.checklist = {
    ...resolveOnboardingState({ meta: { onboarding_started: true, onboarding_version: 2, ...meta }, projectCount, issueCount: 0 }),
    loading: false, finalScreen: false, showChecklist: true,
    acknowledgeStep: mocks.acknowledge, dismiss: mocks.dismiss, finish: mocks.finish,
  };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  mocks.mobile = false;
  mocks.pathname = "/home";
  mocks.projects = [];
  mocks.user = { id: "user", created_at: "2026-11-20T10:00:00Z", user_metadata: { profile_setup_done: true } };
  checklistAt({});
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe("first-run gate (MIN-964)", () => {
  it("shows the full-screen tour on a computer as on a phone", () => {
    render(createElement(FirstRunGate));
    expect(container.querySelector('[data-testid="tour"]')).not.toBeNull();
    mocks.mobile = true;
    render(createElement(FirstRunGate));
    expect(container.querySelector('[data-testid="tour"]')).not.toBeNull();
  });

  it("leaves accounts older than the first-run screens alone", () => {
    mocks.user = { id: "user", created_at: "2026-10-01T10:00:00Z", user_metadata: {} };
    render(createElement(FirstRunGate));
    expect(container.innerHTML).toBe("");
  });
});

describe("getting-started tour on a computer (MIN-964)", () => {
  it("covers the window with a band to move it by", () => {
    render(createElement(OnboardingScreen));
    const page = document.querySelector('[data-first-run][role="dialog"]');
    expect(page?.firstElementChild?.classList.contains("first-run-drag-band")).toBe(true);
    expect(document.body.textContent).toContain(messages.Onboarding.projectTitle);
  });

  it("marks the window while it covers the app, for the dialogs it opens", () => {
    render(createElement(OnboardingScreen));
    expect(document.documentElement.hasAttribute("data-first-run-open")).toBe(true);
    act(() => root.render(createElement("div")));
    expect(document.documentElement.hasAttribute("data-first-run-open")).toBe(false);
  });

  it("loads Home under the last screen and closes only once Home is there", async () => {
    mocks.pathname = "/projects/min-3f2a9c81";
    mocks.checklist = { ...mocks.checklist, finalScreen: true, currentStepId: null };
    render(createElement(OnboardingScreen));
    expect(mocks.push).toHaveBeenCalledWith("/home");
    await click(messages.Common.continue);
    expect(mocks.finish).not.toHaveBeenCalled();
    mocks.pathname = "/home";
    render(createElement(OnboardingScreen));
    await act(async () => {});
    expect(mocks.finish).toHaveBeenCalledOnce();
  });

  it("opens the agent connection in a dialog, not a navigation", async () => {
    checklistAt({ onboarding_steps: ["project", "tickets", "numo"] }, 1);
    render(createElement(OnboardingScreen));
    await click(messages.Onboarding.mcpCta);
    const panel = document.querySelector('[data-testid="mcp-panel"]');
    expect(panel?.getAttribute("data-layout")).toBe("cards");
    expect(panel?.closest('[role="dialog"]:not([data-first-run])')).not.toBeNull();
    expect(document.querySelector("a[href]")).toBeNull();
  });

  it("offers the CSV import to a project owner on a computer only", () => {
    mocks.projects = [{ id: "p", owner_id: "user" }];
    checklistAt({ onboarding_steps: ["project"] }, 1);
    render(createElement(OnboardingScreen));
    expect(button(messages.Onboarding.ticketsCreateCta)).toBeDefined();
    expect(button(messages.Onboarding.ticketsImportCta)).toBeDefined();
    mocks.mobile = true;
    render(createElement(OnboardingScreen));
    expect(button(messages.Onboarding.ticketsImportCta)).toBeUndefined();
  });

  it("opens Numo over the page and moves on", async () => {
    checklistAt({ onboarding_steps: ["project", "tickets"] }, 1);
    render(createElement(OnboardingScreen));
    await click(messages.Onboarding.numoCta);
    expect(mocks.openNumo).toHaveBeenCalledWith({ projectId: null, focusComposer: false });
    expect(mocks.acknowledge).toHaveBeenCalledWith("numo");
  });
});
