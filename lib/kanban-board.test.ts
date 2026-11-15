// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { IssueCard } from "@/components/issue-card";
import type { BulkIssueActions } from "@/components/bulk-issue-actions";
import { ProjectRolesContext, type ViewerProjectRole } from "./projects-context-store";
import { multiProjectBoard, singleProjectBoard, type BoardProjects } from "./board-projects";
import { statusColumns } from "./view-filter";
import type { Issue, Member, Objective, Project } from "./types";

const state = vi.hoisted(() => ({
  cards: new Map<string, ComponentProps<typeof IssueCard>>(),
  bulk: null as ComponentProps<typeof BulkIssueActions> | null,
  pr: null as { projectId?: string | null; projectIds?: readonly string[] } | null,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-app-router", () => ({ useAppRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/undo/undo-context", () => ({ useUndoHistory: () => ({ linked: (run: () => void) => run() }) }));
vi.mock("@/components/drag-cursor", () => ({ DragCursor: () => null }));
vi.mock("@/components/issue-pr-context", () => ({
  IssuePrProvider: (props: { projectId?: string | null; projectIds?: readonly string[]; children: ReactNode }) => {
    state.pr = { projectId: props.projectId, projectIds: props.projectIds };
    return props.children;
  },
}));
vi.mock("@/lib/ask-numo-context", () => ({ AskNumoProvider: (props: { children: ReactNode }) => props.children }));
vi.mock("@/lib/issue-selection-context", () => ({ IssueSelectionProvider: (props: { children: ReactNode }) => props.children }));
vi.mock("@/lib/use-bulk-selection-actions", () => ({ useBulkSelectionActions: () => ({ copyPrompt: async () => {} }) }));
vi.mock("@/components/bulk-issue-actions", () => ({
  BulkIssueActionsPresence: (props: { children: ReactNode }) => props.children,
  BulkIssueActions: (props: ComponentProps<typeof BulkIssueActions>) => {
    state.bulk = props;
    return null;
  },
}));
vi.mock("@/components/issue-card", () => ({
  IssueCard: (props: ComponentProps<typeof IssueCard>) => {
    state.cards.set(props.issue.id, props);
    return null;
  },
}));

import { KanbanBoard } from "@/components/kanban-board";

const member = (user_id: string) => ({ user_id, name: user_id }) as unknown as Member;
const project = (id: string, key: string) => ({ id, key }) as Project;
const issue = (id: string, project_id: string, number: number) => ({
  id, project_id, number, title: id, status: "todo", priority: "none", effort: "none",
  category_ids: [], position: number, created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
}) as unknown as Issue;

let root: Root | null = null;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  container = document.createElement("div");
  document.body.append(container);
});
afterEach(async () => {
  if (root) await act(() => root!.unmount());
  root = null;
  container.remove();
  state.cards.clear();
  state.bulk = null;
  state.pr = null;
  vi.unstubAllGlobals();
});

async function renderBoard(
  issues: Issue[],
  projects: BoardProjects,
  roles: Record<string, ViewerProjectRole["role"]>,
  extra: Partial<ComponentProps<typeof KanbanBoard>> = {},
) {
  const noop = () => {};
  const board = createElement(KanbanBoard, {
    issues, allIssues: issues, relations: [], statuses: statusColumns(["todo"]),
    sort: "manual", projects,
    onOpenIssue: noop, onOpenPlan: noop, onUpdateIssue: noop, onAskNumo: noop,
    onSetCategories: noop, onMove: noop,
    ...extra,
  });
  const roleMap = new Map(Object.entries(roles).map(([id, role]) => [id, { role, canComment: false }]));
  root = createRoot(container);
  await act(() => root!.render(createElement(ProjectRolesContext.Provider, { value: roleMap }, board)));
}

describe("kanban board", () => {
  it("shows a project board's cards in their project, without origin chips", async () => {
    const issues = [issue("one", "p", 1), issue("two", "p", 2)];
    await renderBoard(issues, singleProjectBoard(project("p", "MIN"), [member("ana")], [], []), {}, {
      onCreateIssue: () => {},
    });
    expect(state.pr).toEqual({ projectId: "p", projectIds: undefined });
    expect(state.cards.get("one")!.projectKey).toBe("MIN");
    expect(state.cards.get("one")!.project).toBeUndefined();
    expect(state.cards.get("one")!.onSelect).toBeTypeOf("function");
    expect(state.cards.get("one")!.getCandidateIssues!()).toEqual(issues);
    expect(container.textContent).toContain("newIssue");
  });

  it("has no create slot without a create handler", async () => {
    await renderBoard([issue("one", "p", 1)], singleProjectBoard(project("p", "MIN"), [], [], []), {});
    expect(container.textContent).not.toContain("newIssue");
  });

  it("resolves each card of a cross-project board in its own project and gates selection per project", async () => {
    const goal = { id: "goal", project_id: "a", name: "Goal", status: "planned" } as Objective;
    const projects = multiProjectBoard(
      [project("a", "AAA"), project("b", "BBB")],
      { a: [member("ana"), member("bo")], b: [member("bo")] },
      {},
      { a: [goal] },
    );
    const issues = [issue("mine", "a", 1), issue("also-mine", "a", 2), issue("theirs", "b", 3)];
    await renderBoard(issues, projects, { b: "reader" }, { onAddRelation: vi.fn() });

    expect(state.pr).toEqual({ projectId: null, projectIds: ["a", "b"] });
    expect(state.cards.get("theirs")).toMatchObject({ projectKey: "BBB", project: { id: "b" } });
    expect(state.cards.get("theirs")!.onSelect).toBeUndefined();
    expect(state.cards.get("mine")!.getCandidateIssues!()!.map((i) => i.id)).toEqual(["mine", "also-mine"]);

    // A selection inside one project offers its members, objectives and link.
    const select = state.cards.get("mine")!.onSelect!;
    await act(() => select("mine"));
    await act(() => select("also-mine"));
    expect(state.bulk!.members.map((m) => m.user_id)).toEqual(["ana", "bo"]);
    expect(state.bulk!.objectives).toEqual([goal]);
    expect(state.bulk!.onLink).toBeTypeOf("function");
  });
});
