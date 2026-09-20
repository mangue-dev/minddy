// @vitest-environment jsdom

import { act, createElement, memo } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "./types";
import { rememberCreateProject } from "./last-create-project";

const state = vi.hoisted(() => ({
  pathname: "/all",
  projects: [] as Project[],
  issue: null as Record<string, unknown> | null,
  objective: null as Record<string, unknown> | null,
  dynamicCount: 0,
  record: vi.fn(),
  client: {},
  preload: vi.fn(),
}));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next/dynamic", () => ({ default: () => {
  const issue = state.dynamicCount++ === 0;
  return (props: Record<string, unknown>) => { if (issue) state.issue = props; else state.objective = props; return null; };
} }));
vi.mock("mangue-ui", () => ({ toast: { error: vi.fn() } }));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => state.client }));
vi.mock("@/lib/projects-context", () => ({ useProjects: () => ({ projects: state.projects }) }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/undo/undo-context", () => ({ useUndoHistory: () => ({ record: state.record }) }));
vi.mock("@/lib/use-members-query", () => ({ useMembersQuery: () => ({ members: [] }) }));
vi.mock("@/lib/use-categories-query", () => ({ useCategoriesQuery: () => ({ categories: [] }) }));
vi.mock("@/lib/use-objectives-query", () => ({ useObjectivesQuery: () => ({ objectives: [] }) }));
vi.mock("@/lib/lazy-app-surfaces", () => ({ loadCreateIssueDialog: vi.fn(), loadObjectiveDialog: vi.fn(), preloadSurface: (...args: unknown[]) => state.preload(...args) }));

import { CreateProvider, useCreate } from "./create-context";

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.pathname = "/all";
  state.projects = [{ id: "first" }, { id: "second" }] as Project[];
  state.issue = null;
  state.objective = null;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/all");
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("creation action subscriptions", () => {
  it("keeps 600 closed picker consumers asleep while using the latest route and explicit overrides", async () => {
    let actions: ReturnType<typeof useCreate> | null = null;
    const renders = vi.fn();
    const Consumer = memo(() => { actions = useCreate(); renders(); return null; });
    const children = Array.from({ length: 600 }, (_, id) => createElement(Consumer, { key: id }));
    const root = createRoot(document.createElement("div"));
    const render = () => root.render(createElement(CreateProvider, { children }));
    const route = async (href: string) => {
      state.pathname = new URL(href, "http://localhost").pathname;
      window.history.replaceState(null, "", href);
      await act(render);
    };
    try {
      await act(render);
      const original = actions!;
      expect(renders).toHaveBeenCalledTimes(600);
      await route("/projects/first/pages/one");
      await route("/projects/first/pages/two");
      await route("/projects/second?objective=goal");
      expect(actions).toBe(original);
      expect(renders).toHaveBeenCalledTimes(600);
      await act(() => original.openCreateIssue({ status: "todo" }));
      expect(state.issue).toMatchObject({ projectId: "second", initialObjectiveId: "goal", initialStatus: "todo", open: true });
      await act(() => original.openCreateIssue({ projectId: "first", objectiveId: null, dictate: true }));
      expect(state.issue).toMatchObject({ projectId: "first", initialObjectiveId: null, autoDictate: true });
      await act(() => original.openCreateIssue({ projectId: "first" }));
      expect(state.issue).toMatchObject({ projectId: "first", initialObjectiveId: null, autoDictate: false });
      await act(() => original.openCreateObjective({ name: "  New goal  " }));
      expect(state.objective).toMatchObject({ projectId: "second", initialName: "New goal", open: true });
      await route("/projects/first/pages/three");
      await act(() => original.warmCreateIssue());
      expect(state.issue).toMatchObject({ projectId: "first" });
      await route("/projects/second/pages/four");
      await act(() => original.warmCreateObjective());
      expect(state.objective).toMatchObject({ projectId: "second" });
      expect(actions).toBe(original);
      expect(renders).toHaveBeenCalledTimes(600);
    } finally { await act(() => root.unmount()); }
  });

  it("uses current project access for remembered targets and reports availability without stale closures", async () => {
    let actions: ReturnType<typeof useCreate> | null = null;
    const Consumer = memo(() => { actions = useCreate(); return null; });
    const children = createElement(Consumer);
    const root = createRoot(document.createElement("div"));
    const render = () => root.render(createElement(CreateProvider, { children }));
    try {
      await act(render);
      const original = actions!;
      rememberCreateProject("second");
      await act(() => original.openCreateIssue());
      expect(state.issue).toMatchObject({ projectId: "second" });
      state.projects = [{ id: "third" }, { id: "fourth" }] as Project[];
      await act(render);
      expect(actions).toBe(original);
      await act(() => original.openCreateIssue());
      expect(state.issue).toMatchObject({ projectId: "third" });
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage unavailable"); });
      await act(() => original.openCreateObjective());
      expect(state.objective).toMatchObject({ projectId: "third" });
      state.projects = [];
      await act(render);
      expect(actions!.canCreate).toBe(false);
      const previousIssue = state.issue;
      const previousObjective = state.objective;
      await act(() => { original.openCreateIssue(); original.openCreateObjective(); });
      expect(state.issue).toBe(previousIssue);
      expect(state.objective).toBe(previousObjective);
    } finally { await act(() => root.unmount()); }
  });
});
