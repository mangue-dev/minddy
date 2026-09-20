// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement, memo, useState, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { GlobalKanbanBoard } from "@/components/global-kanban-board";
import type { IssueSidePanel } from "@/components/issue-side-panel";
import type { Issue, Project } from "./types";
import { DEFAULT_CONFIG } from "./view-filter";

const state = vi.hoisted(() => ({
  board: null as ComponentProps<typeof GlobalKanbanBoard> | null,
  panel: null as ComponentProps<typeof IssueSidePanel> | null,
  cardRender: vi.fn(),
  update: vi.fn(async () => {}),
  openCreateIssue: vi.fn(),
  noop: () => {},
}));
const project = { id: "project", key: "PERF", smart_triage_mode: "rules" } as Project;
const issues = Array.from({ length: 600 }, (_, index) => ({
  id: `issue-${index}`, project_id: project.id, number: index + 1,
  title: `Issue ${index}`, status: "todo", priority: "none", effort: "none",
  category_ids: [], updated_at: "2026-09-20T00:00:00Z", position: index,
} as unknown as Issue));
const projects = [project];
const empty = {};
const rows: never[] = [];
const data = {
  issues, membersByProject: empty, categoriesByProject: empty,
  objectivesByProject: empty, integrationsByProject: empty, relations: rows,
  cycles: null, loading: false, updateIssue: state.update, moveIssue: state.update,
  setCategories: state.update, deleteIssue: state.update, createIssue: state.update,
  setIssueCycle: state.update, addRelation: state.update, removeRelation: state.update,
};
const config = { ...DEFAULT_CONFIG, display: { ...DEFAULT_CONFIG.display, hideDone: true } };
const views = { views: rows, viewsLoading: false, activeView: null, activeViewId: "all", config };
const params = new URLSearchParams();
const router = { replace: state.noop };

vi.mock("next/navigation", () => ({ usePathname: () => "/all", useRouter: () => router, useSearchParams: () => params, useParams: () => ({}) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key, useFormatter: () => ({}) }));
vi.mock("mangue-ui", () => ({ Button: () => null, Skeleton: () => null, toast: { error: vi.fn() } }));
vi.mock("@/components/ui/kbd", () => ({ Kbd: () => null }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects, loading: false }) }));
vi.mock("@/lib/create-context", () => ({ useCreate: () => ({ openCreateIssue: state.openCreateIssue }) }));
vi.mock("@/lib/use-global-board-query", () => ({ useGlobalBoardQuery: () => data }));
vi.mock("@/lib/use-board-views", () => ({ useBoardViews: () => views }));
vi.mock("@/lib/current-view-context", () => ({ usePublishCurrentView: () => {} }));
vi.mock("@/lib/app-tab-local-state", () => ({ useAppTabLocalState: (_: string, initial: unknown) => useState(initial) }));
vi.mock("@/lib/use-app-tab-change", () => ({ useAppTabChange: () => {} }));
vi.mock("@/lib/app-tabs-context", () => ({ useOptionalAppTabSession: () => ({}) }));
vi.mock("@/lib/analytics", () => ({ trackEvent: () => {} }));
vi.mock("@/lib/issues-api", () => ({ smartTriageApi: vi.fn() }));
vi.mock("@/lib/assistant-panel-context", () => ({ useAssistantContext: () => {}, useAssistantPanelActions: () => ({ open: state.noop, openIntent: state.noop }) }));
vi.mock("@/components/empty-scene", () => ({ EmptyScene: () => null }));
vi.mock("@/components/board-toolbar", () => ({ BoardToolbar: () => null }));
vi.mock("@/components/board-loading-skeleton", () => ({ BoardLoadingSkeleton: () => null }));
vi.mock("@/components/cycle/cycle-header", () => ({ CycleControls: () => null, formatCycleRange: () => "" }));
vi.mock("@/components/cycle/cycle-empty-states", () => ({ CycleActivationWelcome: () => null, CycleCompletedBanner: () => null, CycleEmptyNotice: () => null, CycleFutureNotice: () => null }));
vi.mock("@/components/cycle/use-cycle-menu-actions", () => ({ useCycleMenuActions: () => state.noop }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({}) }));
vi.mock("@/components/issue-side-panel", () => ({ IssueSidePanel: (props: ComponentProps<typeof IssueSidePanel>) => { state.panel = props; return null; } }));
vi.mock("@/components/global-kanban-board", () => {
  const Card = memo((props: { issue: Issue; onOpenIssue: (issue: Issue) => void; onUpdateIssue: unknown }) => {
    state.cardRender(props.issue.id);
    return createElement("button", { onClick: () => props.onOpenIssue(props.issue) }, props.issue.title);
  });
  return { GlobalKanbanBoard: memo((props: ComponentProps<typeof GlobalKanbanBoard>) => {
    state.board = props;
    return createElement("div", null, ...props.issues.map((issue) => createElement(Card, { key: issue.id, issue, onOpenIssue: props.onOpenIssue, onUpdateIssue: props.onUpdateIssue })));
  }) };
});

import { GlobalBoard } from "@/components/global-board";

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("global board panel isolation", () => {
  it("preserves all 600 cards while opening, changing, and closing issue panels", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const root = createRoot(document.createElement("div"));
    try {
      await act(() => root.render(createElement(GlobalBoard)));
      expect(state.cardRender).toHaveBeenCalledTimes(600);
      const board = state.board!;
      await act(() => board.onOpenIssue(issues[0]));
      expect(state.panel).toMatchObject({ open: true, issue: issues[0], initialTab: "description" });
      expect(state.cardRender).toHaveBeenCalledTimes(600);
      expect(state.board).toBe(board);
      await act(() => board.onOpenPlan(issues[1]));
      expect(state.panel).toMatchObject({ open: true, issue: issues[1], initialTab: "plan" });
      await act(() => state.panel!.onOpenChange(false));
      expect(state.panel?.open).toBe(false);
      expect(state.cardRender).toHaveBeenCalledTimes(600);
      board.onUpdateIssue(issues[2].id, { title: "Changed title" }, project.id);
      expect(state.update).toHaveBeenCalledWith(issues[2].id, { title: "Changed title" }, project.id);
      board.onCreateIssue!("todo");
      expect(state.openCreateIssue).toHaveBeenCalledWith({ status: "todo" });
    } finally { await act(() => root.unmount()); }
  });
});
