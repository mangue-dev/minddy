import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAgentMenuActions } from "@/components/agent/use-agent-menu-actions";
import { useIssueMenuActions, useIssueMenuActionsWithNavigation, type IssueMenuOptions } from "@/components/use-issue-menu-actions";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { RELATION_TYPES } from "./relation-constants";
import type { Issue } from "./types";
import type { PullRequestReadiness } from "./pr-readiness";
import { usePrMergeIntentStore } from "./pr-merge-intent";

const dependencies = vi.hoisted(() => ({
  push: vi.fn(),
  create: vi.fn(),
  mutate: vi.fn(),
  isPending: false,
  hasAppTabs: true,
  routerRead: vi.fn(),
  reuseDestination: vi.fn(() => false),
  toastSuccess: vi.fn(),
  maintain: vi.fn(() => Promise.resolve({ ok: true })),
  invalidate: vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: dependencies.invalidate }) }));
vi.mock("@/lib/agent-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/agent-api")>()),
  maintainPullRequestApi: dependencies.maintain,
}));
vi.mock("sonner", async (importOriginal) => ({
  ...(await importOriginal<typeof import("sonner")>()),
  toast: { success: dependencies.toastSuccess, error: vi.fn() },
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("next/navigation", () => ({ useRouter: () => {
  dependencies.routerRead();
  return { push: dependencies.push };
} }));
vi.mock("@/lib/app-tabs-context", () => ({
  useOptionalAppTabSession: () => dependencies.hasAppTabs ? { create: dependencies.create, reuseDestination: dependencies.reuseDestination } : null,
}));
vi.mock("@/components/pull-requests/pr-unlink-confirmation", () => ({
  usePrUnlinkConfirmation: () => ({ isPending: dependencies.isPending, requestUnlink: dependencies.mutate }),
}));
vi.mock("@/components/numo-icon", () => ({ NumoIcon: () => null }));
vi.mock("@/components/issue-indicators", () => ({ RelationIcon: () => null }));
vi.mock("@/components/issue-field-shortcuts", () => ({ KEY_FOR_FIELD: { objective: "O", dueDate: "D" }, RELATION_SHORTCUT_HINT: "R" }));

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
  dependencies.reuseDestination.mockReturnValue(false);
});
afterEach(() => vi.unstubAllGlobals());

describe("shared issue menu actions", () => {
  it("keeps agent, PR, relation, field, cycle, and trash actions in the same order", () => {
    const { actions, action, options } = build();
    expect(actions.map((item) => item.id)).toEqual([
      "copy-prompt", "launch-agent", "copy-identifier", "pull-request", "relations",
      "set-objective", "set-due-date", "cycle-add", "delete",
    ]);
    expect(actions.slice(0, 2)).toEqual(options.agentActions);
    // Without readiness, the submenu opens the PR and, apart, unlinks it.
    expect(action("pull-request").children?.map((item) => item.id)).toEqual(["open-pr", "unlink-pr"]);
    expect(action("unlink-pr")).toMatchObject({ separatorBefore: true, variant: "destructive" });
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
    for (const id of ["unlink-pr", "set-objective", "set-due-date", "delete", ...RELATION_TYPES.map((type) => `relation-${type}`)]) {
      expect(action(id).transfersFocus, id).toBe(true);
    }
    for (const id of ["cycle-add", "open-pr"]) {
      expect(action(id).transfersFocus, id).not.toBe(true);
    }

    let actions: ContextMenuAction[] = [];
    function AgentSurface() {
      const handler = vi.fn();
      actions = useAgentMenuActions({
        hasPlan: false,
        onCopyPrompt: handler, onCopyPlanPrompt: handler, onCopyVerifyPrompt: handler,
        onCopyCustomPrompt: handler,
      });
      return null;
    }
    renderToString(createElement(AgentSurface));
    const leaves = actions.flatMap((item) => item.children ?? [item]);
    expect(leaves.filter((item) => item.transfersFocus).map((item) => item.id)).toEqual([
      "copy-prompt-custom",
    ]);
  });

  it("hides unavailable or already-set actions without changing the supplied actions", () => {
    const { actions } = build({
      issue: { id: "issue", number: 623, objective_id: "objective", due_date: "2026-10-01" } as Issue,
      pr: null, onSelectRelation: undefined, onDelete: undefined,
    });
    expect(actions.map((item) => item.id)).toEqual(["copy-prompt", "launch-agent", "copy-identifier", "cycle-add"]);
    expect(build({ hasObjectives: false }).actions.map((item) => item.id)).not.toContain("set-objective");
  });

  it("offers linking to a pull request only while the issue has no live one", () => {
    const onLinkPullRequest = vi.fn();
    const unlinked = build({ pr: null, onLinkPullRequest });
    unlinked.action("link-pr").onSelect?.();
    expect(onLinkPullRequest).toHaveBeenCalledOnce();
    expect(unlinked.action("link-pr").transfersFocus).toBe(true);
    expect(() => build({ onLinkPullRequest }).action("link-pr")).toThrow();
    // A delivered PR stays in its submenu, which offers linking another.
    const merged = build({ pr: { prId: "pr", state: "merged", prNumber: 42 }, onLinkPullRequest });
    expect(merged.action("pull-request").children?.map((item) => item.id)).toEqual(["open-pr", "link-pr", "unlink-pr"]);
    expect(build({ pr: null, onLinkPullRequest, readOnly: true }).actions.map((item) => item.id)).not.toContain("link-pr");
  });

  it("copies the issue identifier, for readers too", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    build().action("copy-identifier").onSelect?.();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith("MIN-623");
    expect(dependencies.toastSuccess).toHaveBeenCalledWith("MIN-623");
    const reader = build({ readOnly: true });
    expect(reader.actions.map((item) => item.id)).toEqual(["copy-identifier", "pull-request"]);
    expect(reader.action("pull-request").children?.map((item) => item.id)).toEqual(["open-pr"]);
  });

  it("opens the PR in a tab of its own and unlinks the exact issue", () => {
    const { action } = build();
    action("open-pr").onSelect?.();
    expect(dependencies.reuseDestination).toHaveBeenCalledWith("/pull-requests?pr=pr");
    expect(dependencies.create).toHaveBeenCalledWith("/pull-requests?pr=pr");
    expect(dependencies.push).not.toHaveBeenCalled();
    action("unlink-pr").onSelect?.();
    expect(dependencies.mutate).toHaveBeenCalledWith({ prId: "pr", issueId: "issue", identifier: "MIN-623" });
    dependencies.isPending = true;
    expect(build().action("unlink-pr").disabled).toBe(true);
  });

  it("switches to the tab already showing the PR", () => {
    dependencies.reuseDestination.mockReturnValue(true);
    build().action("open-pr").onSelect?.();
    expect(dependencies.reuseDestination).toHaveBeenCalledExactlyOnceWith("/pull-requests?pr=pr");
    expect(dependencies.create).not.toHaveBeenCalled();
  });

  it("navigates in place when the app tab provider is absent, without reading Next route context", () => {
    dependencies.hasAppTabs = false;
    const navigate = vi.fn();
    build({}, navigate).action("open-pr").onSelect?.();
    expect(navigate).toHaveBeenCalledWith("/pull-requests?pr=pr");
    expect(dependencies.routerRead).not.toHaveBeenCalled();
  });

  const readiness = (mergeAllowed: boolean) => ({
    state: mergeAllowed ? "ready" : "checks_running", blockers: [], passed: [], mergeAllowed,
    methods: ["squash"], preferredMethod: "squash",
  }) as PullRequestReadiness;
  const flow = (active: boolean, canWrite = true) => ({ active, autoMergeAllowed: true, canWrite });

  it("offers the Code review page's merge gestures to a viewer who can write", () => {
    const ready = build({ prReadiness: { readiness: readiness(true), unavailable: false, flow: flow(false) } });
    expect(ready.action("pull-request").children?.map((item) => item.id)).toEqual(["open-pr", "merge-pr", "unlink-pr"]);
    ready.action("merge-pr").onSelect?.();
    // The merge opens the PR's own dialog, in its tab.
    expect(usePrMergeIntentStore.getState().prId).toBe("pr");
    expect(dependencies.create).toHaveBeenCalledWith("/pull-requests?pr=pr");

    const waiting = build({ prReadiness: { readiness: readiness(false), unavailable: false, flow: flow(false) } });
    expect(waiting.action("pull-request").children?.map((item) => item.id)).toEqual(["open-pr", "enable-auto-merge", "unlink-pr"]);
    waiting.action("enable-auto-merge").onSelect?.();
    expect(dependencies.maintain).toHaveBeenCalledWith("pr", "enable_auto_merge");

    const armed = build({ prReadiness: { readiness: readiness(false), unavailable: false, flow: flow(true) } });
    armed.action("disable-auto-merge").onSelect?.();
    expect(dependencies.maintain).toHaveBeenLastCalledWith("pr", "disable_auto_merge");

    const reader = build({ prReadiness: { readiness: readiness(true), unavailable: false, flow: flow(false, false) } });
    expect(reader.action("pull-request").children?.map((item) => item.id)).toEqual(["open-pr", "unlink-pr"]);
  });

  // MIN-833: a right-click on a card of a multi-ticket selection.
  function selection(planned: number) {
    return {
      count: 3,
      planned,
      onCopyPrompt: vi.fn(),
      onCustomPrompt: vi.fn(),
      onCopyIdentifiers: vi.fn(),
    };
  }

  it("acts on the whole selection: combined prompts, identifiers and shared fields", () => {
    const sel = selection(0);
    // The anchor card already has an objective and a due date: the other
    // selected tickets may not, so both entries stay offered.
    const { actions, action, options } = build({
      issue: { id: "issue", project_id: "project", number: 623, objective_id: "objective", due_date: "2026-10-01" } as Issue,
      selection: sel,
    });
    expect(actions.map((item) => item.id)).toEqual([
      "copy-selection-prompt", "copy-identifiers", "relations", "set-objective", "set-due-date",
    ]);
    const onLink = vi.fn();
    const linking = build({ selection: { ...selection(0), pullRequests: [{ prId: "pr", prNumber: 42, onLink }] } });
    expect(linking.actions.map((item) => item.id)).toContain("link-others-pr-pr");
    linking.action("link-others-pr-pr").onSelect?.();
    expect(onLink).toHaveBeenCalledOnce();
    expect(action("copy-selection-prompt").children?.map((item) => item.id)).toEqual([
      "copy-selection-prompt-plan", "copy-selection-prompt-implement",
      "copy-selection-prompt-verify", "copy-selection-prompt-custom",
    ]);
    expect(action("copy-selection-prompt-implement").shortcut).toBe("⇧P");
    for (const kind of ["plan", "implement", "verify"] as const) {
      action(`copy-selection-prompt-${kind}`).onSelect?.();
      expect(sel.onCopyPrompt).toHaveBeenLastCalledWith(kind);
    }
    action("copy-selection-prompt-custom").onSelect?.();
    expect(sel.onCustomPrompt).toHaveBeenCalledOnce();
    expect(action("copy-selection-prompt-custom").transfersFocus).toBe(true);
    action("copy-identifiers").onSelect?.();
    expect(sel.onCopyIdentifiers).toHaveBeenCalledOnce();
    action("set-due-date").onSelect?.();
    expect(options.onOpenField).toHaveBeenLastCalledWith("dueDate");
  });

  it("names the plan entry after the selection's plans", () => {
    const planLabel = (planned: number) =>
      build({ selection: selection(planned) }).action("copy-selection-prompt-plan").label;
    expect(planLabel(0)).toBe("actionWritePlans");
    expect(planLabel(3)).toBe("actionReviewPlans");
    expect(planLabel(1)).toBe("actionWriteOrReviewPlans");
  });

  it("gives a reader of a selection the identifiers only", () => {
    expect(build({ selection: selection(0), readOnly: true }).actions.map((item) => item.id)).toEqual([
      "copy-identifiers",
    ]);
  });
});
