// @vitest-environment jsdom
import { act, createElement, Fragment, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectSettingsPage from "@/app/(app)/projects/[id]/settings/page";
import { ProjectGeneralSection } from "@/components/settings/project-general-section";
import { AppTabsSession } from "./app-tabs-session";
import { createHomeTab } from "./app-tabs";
import type { Project } from "./types";

const state = vi.hoisted(() => ({
  session: null as AppTabsSession | null,
  confirmDelete: null as (() => Promise<void>) | null,
  deleteProject: vi.fn(async () => {}),
  removeMember: vi.fn(async () => {}),
  refetch: vi.fn(),
  router: { push: vi.fn(), replace: vi.fn() },
}));
const project = { id: "project", owner_id: "owner", name: "Project", key: "PRJ" } as Project;
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "project" }), useRouter: () => state.router }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/app-tabs-context", () => ({ useOptionalAppTabSession: () => state.session }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { id: "owner" } }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({
  projects: [project], loading: false, deleteProject: state.deleteProject, refetch: state.refetch,
}) }));
vi.mock("@/lib/members-api", () => ({ removeMemberApi: state.removeMember }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantContext: () => {} }));
vi.mock("mangue-ui", () => ({
  Button: ({ children, onClick, disabled }: ComponentProps<"button">) => createElement("button", { onClick, disabled }, children),
  ConfirmDeleteDialog: ({ onConfirm }: { onConfirm: () => Promise<void> }) => { state.confirmDelete = onConfirm; return null; },
  Badge: () => null, Input: () => null, Spinner: () => null,
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/components/settings/settings-ui", () => ({
  SettingsGroup: ({ children, action }: { children?: ReactNode; action?: ReactNode }) => createElement(Fragment, null, children, action),
  SettingsRow: () => null,
}));
vi.mock("@/components/settings-shell", () => ({ SettingsShell: () => null }));
vi.mock("@/components/project-members", () => ({ ProjectMembers: () => null }));
vi.mock("@/components/project-categories", () => ({ ProjectCategories: () => null }));
vi.mock("@/components/project-integrations", () => ({ ProjectIntegrations: () => null }));
vi.mock("@/components/project-feedback-settings", () => ({ ProjectFeedbackSettings: () => null }));
vi.mock("@/components/settings/project-git-section", () => ({ ProjectGitSection: () => null }));
vi.mock("@/components/settings/project-import-section", () => ({ ProjectImportSection: () => null }));
vi.mock("@/components/settings/project-recurrences-section", () => ({ ProjectRecurrencesSection: () => null }));
vi.mock("@/components/settings/smart-assign-section", () => ({ SmartAssignSection: () => null }));
vi.mock("@/components/project-icon-picker", () => ({ ProjectIconPicker: () => null }));
vi.mock("@/components/route-skeletons", () => ({ SettingsPageSkeleton: () => null }));

let root: Root;
let container: HTMLDivElement;
let projectTabId: string;
let homeTabId: string;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  const home = createHomeTab("owner");
  const settings = { ...createHomeTab("owner", undefined, 1), href: "/projects/project/settings" };
  homeTabId = home.id;
  projectTabId = settings.id;
  state.session = new AppTabsSession("owner", {
    create: vi.fn(), patch: vi.fn(), close: vi.fn(), move: vi.fn(),
  });
  state.session.receive([home, settings]);
  await state.session.initialize(settings.href);
  state.router.replace.mockImplementation((href: string) => state.session!.observe(href, null));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(() => root.unmount());
  state.session!.dispose();
  container.remove();
  vi.unstubAllGlobals();
});

function expectProjectDestinationReplaced() {
  expect(state.router.replace).toHaveBeenCalledExactlyOnceWith("/home");
  expect(state.router.push).not.toHaveBeenCalled();
  const snapshot = state.session!.getSnapshot();
  expect(snapshot.activeId).toBe(projectTabId);
  expect(snapshot.tabs.find((tab) => tab.id === projectTabId)?.href).toBe("/home");
  expect(snapshot.tabs.find((tab) => tab.id === homeTabId)?.href).toBe("/home");
}

describe("project removal navigation", () => {
  it("replaces the deleted project's tab even when Home is already open", async () => {
    await act(() => root.render(createElement(ProjectSettingsPage)));
    await act(async () => { await state.confirmDelete!(); });
    expect(state.deleteProject).toHaveBeenCalledExactlyOnceWith(project.id);
    expectProjectDestinationReplaced();
  });
  it("replaces the departed project's tab even when Home is already open", async () => {
    await act(() => root.render(createElement(ProjectGeneralSection, { project, isOwner: false, onRequestDelete: vi.fn() })));
    await act(async () => { container.querySelector("button")!.click(); });
    expect(state.removeMember).toHaveBeenCalledExactlyOnceWith(project.id, "owner");
    expect(state.refetch).toHaveBeenCalledOnce();
    expectProjectDestinationReplaced();
  });
});
