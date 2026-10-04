import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import { useIssueMenuActions, useIssueMenuActionsWithNavigation, type IssueMenuOptions } from "@/components/use-issue-menu-actions";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { RELATION_TYPES } from "./relation-constants";
import type { Issue } from "./types";

const dependencies = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  hasAppTabs: true,
  routerRead: vi.fn(),
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => {
  dependencies.routerRead();
  return { push: dependencies.push };
} }));
vi.mock("@/lib/app-tabs-context", () => ({
  useOptionalAppTabSession: () => dependencies.hasAppTabs ? { create: dependencies.create } : null,
}));
vi.mock("@/lib/use-unlink-pull-request-issue", () => ({
  useUnlinkPullRequestIssue: () => ({ isPending: dependencies.isPending, mutate: dependencies.mutate }),
}));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/issue-indicators", () => ({ RelationIcon: () => null }));
vi.mock("@/components/issue-field-shortcuts", () => ({ KEY_FOR_FIELD: { objective: "O", dueDate: "D" } }));

function build(overrides: Partial<IssueMenuOptions> = {}, navigate?: (href: string) => void) {
  const options: IssueMenuOptions = {
    issue: { id: "issue", project_id: "project", number: 623, objective_id: null, due_date: null } as Issue,
    projectKey: "MIN",
    agentActions: [{ id: "copy-prompt", label: "Copy prompt" }, { id: "launch-agent", label: "Launch agent" }],
    pr: { prId: "pr", state: "open", prNumber: 42 },
    hasObjectives: true,
    onSelectRelation: vi.fn(),
    onOpenField: vi.fn(),
    extraActions: [{ id: "cycle-add", label: "Add to cycle" }],
    onDelete: vi.fn(),
    ...overrides,
  };
  let actions: ContextMenuAction[] = [];
  function Surface() {
    actions = useIssueMenuActions()(options);
    return null;
  }
  function CardSurface() {
    actions = useIssueMenuActionsWithNavigation(navigate!)(options);
    return null;
  }
  renderToString(createElement(navigate ? CardSurface : Surface));
  const action = (id: string) => {
    const found = actions.flatMap((item) => [item, ...(item.children ?? [])]).find((item) => item.id === id);
    if (!found) throw new Error(`Missing action: ${id}`);
    return found;
  };
  return { actions, action, options };
}

beforeEach(() => {
  vi.clearAllMocks();
  dependencies.isPending = false;
  dependencies.hasAppTabs = true;
});
afterEach(() => vi.unstubAllGlobals());

describe("shared issue menu actions", () => {
  it("keeps agent, PR, relation, field, cycle, and trash actions in the same order", () => {
    const { actions, action, options } = build();
    expect(actions.map((item) => item.id)).toEqual([
      "copy-prompt", "launch-agent", "open-pr", "unlink-pr", "relations",
      "set-objective", "set-due-date", "cycle-add", "delete",
    ]);
    expect(actions.slice(0, 2)).toEqual(options.agentActions);
    expect(action("open-pr").children?.map((item) => item.id)).toEqual(["open-pr-current-tab", "open-pr-new-tab"]);
    for (const type of RELATION_TYPES) {
      action(`relation-${type}`).onSelect?.();
      expect(options.onSelectRelation).toHaveBeenLastCalledWith(type);
    }
    action("set-objective").onSelect?.();
    expect(options.onOpenField).toHaveBeenLastCalledWith("objective");
    expect(action("set-objective").shortcut).toBe("O");
    action("set-due-date").onSelect?.();
    expect(options.onOpenField).toHaveBeenLastCalledWith("dueDate");
    expect(action("set-due-date").shortcut).toBe("D");
    action("delete").onSelect?.();
    expect(options.onDelete).toHaveBeenCalledOnce();
    expect(action("delete")).toMatchObject({ separatorBefore: true, variant: "destructive" });
  });

  it("transfers focus only for actions opening another surface", () => {
    const { action } = build();
    for (const id of ["set-objective", "set-due-date", "delete", ...RELATION_TYPES.map((type) => `relation-${type}`)]) {
      expect(action(id).transfersFocus, id).toBe(true);
    }
    for (const id of ["unlink-pr", "cycle-add", "open-pr-current-tab", "open-pr-new-tab"]) {
      expect(action(id).transfersFocus, id).not.toBe(true);
    }

    let actions: ContextMenuAction[] = [];
    function AgentSurface() {
      const handler = vi.fn();
      actions = useAgentMenuActions({
        agentsEnabled: true, hasSession: true, hasPlan: false,
        onCopyPrompt: handler, onCopyPlanPrompt: handler, onCopyVerifyPrompt: handler,
        onCopyCustomPrompt: handler, onImplementWithAgent: handler, onWritePlanWithAgent: handler,
        onVerifyWithAgent: handler, onCustomWithAgent: handler, onOpenSession: handler,
      });
      return null;
    }
    renderToString(createElement(AgentSurface));
    const leaves = actions.flatMap((item) => item.children ?? [item]);
    expect(leaves.filter((item) => item.transfersFocus).map((item) => item.id)).toEqual([
      "copy-prompt-custom", "open-agent", "agent-plan", "agent-implement", "agent-verify", "agent-custom",
    ]);
  });

  it("hides unavailable or already-set actions without changing the supplied actions", () => {
    const { actions } = build({
      issue: { id: "issue", number: 623, objective_id: "objective", due_date: "2026-10-01" } as Issue,
      pr: null, onSelectRelation: undefined, onDelete: undefined,
    });
    expect(actions.map((item) => item.id)).toEqual(["copy-prompt", "launch-agent", "cycle-add"]);
    expect(build({ hasObjectives: false }).actions.map((item) => item.id)).not.toContain("set-objective");
  });

  it("opens PRs in the requested app tab and unlinks the exact issue", () => {
    const { action } = build();
    action("open-pr-current-tab").onSelect?.();
    expect(dependencies.push).toHaveBeenCalledWith("/pull-requests?pr=pr");
    action("open-pr-new-tab").onSelect?.();
    expect(dependencies.create).toHaveBeenCalledWith("/pull-requests?pr=pr");
    action("unlink-pr").onSelect?.();
    expect(dependencies.mutate).toHaveBeenCalledWith({ prId: "pr", issueId: "issue", identifier: "MIN-623" });
    dependencies.isPending = true;
    expect(build().action("unlink-pr").disabled).toBe(true);
  });

  it("uses a browser tab when the app tab provider is absent", () => {
    dependencies.hasAppTabs = false;
    const open = vi.fn();
    vi.stubGlobal("window", { open });
    build().action("open-pr-new-tab").onSelect?.();
    expect(open).toHaveBeenCalledWith("/pull-requests?pr=pr", "_blank", "noopener,noreferrer");
  });

  it("uses the owning column's navigation action without reading Next route context", () => {
    const navigate = vi.fn();
    const { action } = build({}, navigate);
    action("open-pr-current-tab").onSelect?.();
    expect(navigate).toHaveBeenCalledWith("/pull-requests?pr=pr");
    expect(dependencies.routerRead).not.toHaveBeenCalled();
    action("open-pr-new-tab").onSelect?.();
    expect(dependencies.create).toHaveBeenCalledWith("/pull-requests?pr=pr");
  });
});
