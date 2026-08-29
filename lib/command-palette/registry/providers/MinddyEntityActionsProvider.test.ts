import { describe, expect, it, vi } from "vitest";
import type { PaletteItem } from "../../types";
import { createMinddyEntityActionsProvider } from "./MinddyEntityActionsProvider";

const labels = {
  copied: "Copied",
  linkCopied: "Link copied",
  openInNewTab: "Open in a new tab",
  copyLink: "Copy link",
  newIssue: "New issue",
  newObjective: "New objective",
  copyProjectKey: "Copy project key",
  openObjectives: "Open objectives",
  openPages: "Open pages",
  openTriage: "Open triage",
  openFeedback: "Open feedback",
  openProjectSettings: "Open project settings",
  viewObjectiveIssues: "View objective issues",
  newIssueForObjective: "New issue for this objective",
  copyObjectiveName: "Copy objective name",
  openProjectBoard: "Open project board",
  newIssueInProject: "New issue in this project",
  copyPageTitle: "Copy page title",
  copyIssueTitle: "Copy issue title",
  openLinkedObjective: "Open linked objective",
};

function setup() {
  const navigate = vi.fn();
  const openInNewTab = vi.fn();
  const copyText = vi.fn(async () => undefined);
  const openCreateIssue = vi.fn();
  const openCreateObjective = vi.fn();
  const provider = createMinddyEntityActionsProvider({
    labels,
    navigate,
    openInNewTab,
    copyText,
    openCreateIssue,
    openCreateObjective,
  });
  return {
    provider,
    navigate,
    openInNewTab,
    copyText,
    openCreateIssue,
    openCreateObjective,
  };
}

function item(entityType: string, data?: unknown): PaletteItem {
  return {
    id: `${entityType}-1`,
    title: entityType,
    filterCategory: entityType,
    entityType,
    href: `/projects/project-1/${entityType}-1`,
    data,
  };
}

function actionIds(entity: PaletteItem): string[] {
  return setup().provider.getActions(entity, {} as never).map((action) => action.id);
}

describe("Minddy entity palette actions", () => {
  it("keeps generic navigation targets linkable", () => {
    expect(actionIds(item("navigation"))).toEqual([
      "entity.open-new-tab",
      "entity.copy-link",
    ]);
  });

  it("covers project creation and every primary project destination", () => {
    const ids = actionIds(
      item("project", { id: "project-1", key: "MIN", name: "Minddy" })
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "project.new-issue",
        "project.new-objective",
        "project.copy-key",
        "project.objectives",
        "project.pages",
        "project.triage",
        "project.feedback",
        "project.settings",
        "entity.open-new-tab",
        "entity.copy-link",
      ])
    );
    expect(ids).toHaveLength(10);
  });

  it("makes an objective's issues and linked issue creation first-class actions", async () => {
    const context = setup();
    const objective = item("objective", {
      id: "objective-1",
      project_id: "project-1",
      name: "Ship",
      status: "in_progress",
      color: null,
    });
    const actions = context.provider.getActions(objective, {} as never);
    expect(actions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "objective.issues",
        "objective.new-issue",
        "objective.new-objective",
        "objective.copy-name",
        "objective.list",
        "objective.project",
        "entity.open-new-tab",
        "entity.copy-link",
      ])
    );
    await actions.find((action) => action.id === "objective.issues")?.execute?.(
      objective,
      {} as never
    );
    expect(context.navigate).toHaveBeenCalledWith(
      "/projects/project-1?objective=objective-1"
    );
    await actions.find((action) => action.id === "objective.new-issue")?.execute?.(
      objective,
      {} as never
    );
    expect(context.openCreateIssue).toHaveBeenCalledWith(
      "project-1",
      "objective-1"
    );
  });

  it("covers page context without exposing unsafe document mutations", () => {
    const ids = actionIds(
      item("page", {
        id: "page-1",
        project_id: "project-1",
        title: "Runbook",
        icon: null,
        updated_at: "2026-08-29T00:00:00Z",
      })
    );
    expect(ids).toEqual(
      expect.arrayContaining([
        "page.new-issue",
        "page.copy-title",
        "page.index",
        "page.project",
        "entity.open-new-tab",
        "entity.copy-link",
      ])
    );
    expect(ids.some((id) => id.includes("delete") || id.includes("trash"))).toBe(false);
  });

  it("adds objective navigation only to issues that are linked to one", () => {
    const baseIssue = {
      id: "issue-1",
      project_id: "project-1",
      number: 42,
      title: "Audit palette",
      status: "in_progress",
      priority: "high",
      effort: "m",
      assignee_id: null,
      updated_at: "2026-08-29T00:00:00Z",
    };
    const linked = actionIds(
      item("issue", { ...baseIssue, objective_id: "objective-1" })
    );
    const unlinked = actionIds(item("issue", { ...baseIssue, objective_id: null }));
    expect(linked).toEqual(
      expect.arrayContaining(["issue.open-objective", "issue.objective-issues"])
    );
    expect(unlinked).not.toContain("issue.open-objective");
    expect(unlinked).not.toContain("issue.objective-issues");
  });

  it("passes stable hrefs through the clipboard and new-tab actions", async () => {
    const context = setup();
    const navigation = item("navigation");
    const actions = context.provider.getActions(navigation, {} as never);
    await actions.find((action) => action.id === "entity.copy-link")?.execute?.(
      navigation,
      {} as never
    );
    await actions.find((action) => action.id === "entity.open-new-tab")?.execute?.(
      navigation,
      {} as never
    );
    expect(context.copyText).toHaveBeenCalledWith(
      navigation.href,
      labels.linkCopied,
      true
    );
    expect(context.openInNewTab).toHaveBeenCalledWith(navigation.href);
  });

  it("does not treat a slash-prefixed title as an application link", async () => {
    const context = setup();
    const page = {
      ...item("page", {
        id: "page-1",
        project_id: "project-1",
        title: "/Runbook",
        icon: null,
        updated_at: "2026-08-29T00:00:00Z",
      }),
      title: "/Runbook",
    };
    const actions = context.provider.getActions(page, {} as never);
    await actions.find((action) => action.id === "page.copy-title")?.execute?.(
      page,
      {} as never
    );
    expect(context.copyText).toHaveBeenCalledWith("/Runbook", labels.copied);
  });
});
