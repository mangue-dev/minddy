// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppTabRouteProvider } from "./app-tab-route-context";
import { markFirstContent, resetFirstContentForTests } from "./first-content";
import { useBoardScreen } from "./use-board-screen";
import type { Issue, View } from "./types";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), openAssistant: vi.fn(), toastSuccess: vi.fn(), preload: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => `${key}${values ? JSON.stringify(values) : ""}`,
}));
vi.mock("sonner", () => ({ toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args) } }));
vi.mock("./assistant-panel-context", () => ({ useAssistantPanelActions: () => ({ open: mocks.openAssistant }) }));
vi.mock("./lazy-app-surfaces", () => ({ loadIssueSidePanel: mocks.preload, preloadSurface: (load: () => void) => load() }));

type Screen = ReturnType<typeof useBoardScreen>;
const view = { id: "view-1", name: "Mine" } as View;
let screen: Screen;
let root: Root;

function Harness({ projectId, activeView }: { projectId: string | null; activeView: View | null }) {
  screen = useBoardScreen({
    projectId,
    activeView,
    createViewAndSelect: async () => view,
    beginGenerating: vi.fn(),
  });
  return null;
}

async function mount({ search = "", projectId = "project" as string | null, activeView = null as View | null } = {}) {
  const route = { pathname: "/board", search, projectSegment: null };
  await act(() => root.render(createElement(AppTabRouteProvider, { route,
    children: createElement(Harness, { projectId, activeView }) })));
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestIdleCallback", undefined);
  resetFirstContentForTests();
  vi.clearAllMocks();
  root = createRoot(document.createElement("div"));
});
afterEach(async () => {
  await act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useBoardScreen", () => {
  it("mounts the closed panel once the page is idle after its first content", async () => {
    await mount();
    expect(screen.panel.mounted).toBe(false);
    await act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.panel.mounted).toBe(false);
    await act(() => { markFirstContent(); });
    await act(() => { vi.advanceTimersByTime(2_000); });
    expect(screen.panel.mounted).toBe(true);
    expect(screen.panel.openIssueRef).toBeNull();
    expect(screen.panel.onPointerEnter).toBeUndefined();
  });

  it("mounts the panel on the first opened issue and keeps it mounted after closing", async () => {
    await mount();
    await act(() => screen.panel.openPlan({ id: "issue-1" } as Issue));
    expect(screen.panel).toMatchObject({ mounted: true, openIssueRef: "issue-1", tab: "plan" });
    await act(() => screen.panel.openIssueById("issue-2"));
    expect(screen.panel).toMatchObject({ openIssueRef: "issue-2", tab: "description" });
    await act(() => screen.panel.onOpenChange(false));
    expect(screen.panel).toMatchObject({ mounted: true, openIssueRef: null });
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("opens a ?issue= deep link and strips it when the panel closes", async () => {
    await mount({ search: "issue=MIN-42" });
    expect(screen.panel).toMatchObject({ mounted: true, openIssueRef: "MIN-42", tab: "description" });
    await act(() => screen.panel.onOpenChange(false));
    expect(mocks.replace).toHaveBeenCalledWith("/board");
  });

  it("hands a described view to Numo with the project only on a project board", async () => {
    await mount({ projectId: "project" });
    await act(() => screen.handleCreateView("Mine", " urgent bugs "));
    expect(mocks.openAssistant).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: "project", pageContext: { projectId: "project", viewId: "view-1", viewName: "Mine" },
    }));
    await mount({ projectId: null });
    await act(() => screen.handleCreateView("Mine", "urgent bugs"));
    expect(mocks.openAssistant).toHaveBeenLastCalledWith(expect.objectContaining({
      projectId: null, pageContext: { viewId: "view-1", viewName: "Mine" },
    }));
    await act(() => screen.handleCreateView("Plain"));
    expect(mocks.openAssistant).toHaveBeenCalledTimes(2);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('viewCreated{"name":"Plain"}');
  });

  it("asks Numo about the filters with the active view, or opens the composer", async () => {
    await mount({ projectId: null });
    screen.handleAskAI("");
    expect(mocks.openAssistant).toHaveBeenLastCalledWith({ projectId: null, focusComposer: true, pageContext: undefined });
    await mount({ projectId: "project", activeView: view });
    screen.handleAskAI("only mine");
    expect(mocks.openAssistant).toHaveBeenLastCalledWith({
      projectId: "project",
      prompt: 'aiFilterPrompt{"wish":"only mine"}',
      pageContext: { projectId: "project", viewId: "view-1", viewName: "Mine" },
    });
    await mount({ projectId: "project", activeView: null });
    screen.handleAskAI("");
    expect(mocks.openAssistant).toHaveBeenLastCalledWith({ projectId: "project", focusComposer: true, pageContext: { projectId: "project" } });
  });
});
