import {
  Copy,
  ExternalLink,
  FileText,
  FolderKanban,
  Link2,
  ListTodo,
  Settings,
  Target,
  CircleDashed,
} from "lucide-react";
import type {
  Project,
  SearchIndexIssue,
  SearchIndexObjective,
  SearchIndexPage,
} from "@/lib/types";
import type { PaletteItem } from "../../types";
import type { ActionProvider, ContextualAction } from "../types";

export interface MinddyEntityActionLabels {
  copied: string;
  linkCopied: string;
  openInNewTab: string;
  copyLink: string;
  newIssue: string;
  newObjective: string;
  copyProjectKey: string;
  openObjectives: string;
  openPages: string;
  openTriage: string;
  openFeedback: string;
  openProjectSettings: string;
  viewObjectiveIssues: string;
  newIssueForObjective: string;
  copyObjectiveName: string;
  openProjectBoard: string;
  newIssueInProject: string;
  copyPageTitle: string;
  copyIssueTitle: string;
  openLinkedObjective: string;
}

export interface MinddyEntityActionsDependencies {
  labels: MinddyEntityActionLabels;
  navigate: (href: string) => void;
  openInNewTab: (href: string) => void;
  copyText: (
    value: string,
    confirmation: string,
    resolveHref?: boolean
  ) => Promise<void>;
  openCreateIssue: (projectId: string, objectiveId?: string) => void;
  openCreateObjective: (projectId: string) => void;
}

/**
 * Build the exhaustive, read-safe action catalog for each searchable entity.
 * Mutating field actions for issues remain in the issue provider; this catalog
 * owns navigation, creation and clipboard actions shared across entity types.
 */
export function createMinddyEntityActionsProvider(
  dependencies: MinddyEntityActionsDependencies
): ActionProvider {
  const { labels } = dependencies;

  const go = (
    id: string,
    label: string,
    icon: typeof FolderKanban,
    href: string,
    priority = 0
  ): ContextualAction => ({
    id,
    label,
    icon,
    category: "navigation",
    priority,
    execute: async () => {
      dependencies.navigate(href);
      return { success: true };
    },
  });

  const create = (
    id: string,
    label: string,
    icon: typeof ListTodo,
    run: () => void,
    priority = 0
  ): ContextualAction => ({
    id,
    label,
    icon,
    category: "secondary",
    priority,
    execute: async () => {
      run();
      return { success: true };
    },
  });

  const copy = (
    id: string,
    label: string,
    value: string,
    priority = 0
  ): ContextualAction => ({
    id,
    label,
    icon: Copy,
    category: "secondary",
    priority,
    execute: async () => {
      await dependencies.copyText(value, labels.copied);
      return { success: true, closeMenu: false };
    },
  });

  const linkActions = (item: PaletteItem): ContextualAction[] => {
    if (!item.href) return [];
    return [
      {
        id: "entity.open-new-tab",
        label: labels.openInNewTab,
        icon: ExternalLink,
        category: "navigation",
        priority: -90,
        execute: async () => {
          dependencies.openInNewTab(item.href as string);
          return { success: true };
        },
      },
      {
        id: "entity.copy-link",
        label: labels.copyLink,
        icon: Link2,
        category: "secondary",
        priority: -90,
        execute: async () => {
          await dependencies.copyText(item.href as string, labels.linkCopied, true);
          return { success: true, closeMenu: false };
        },
      },
    ];
  };

  return {
    id: "minddy-entity-actions",
    handles: ["navigation", "project", "objective", "page", "issue", "saved-view"],
    priority: 40,
    getActions: (item): ContextualAction[] => {
      const actions = linkActions(item);

      if (item.entityType === "navigation" || item.entityType === "saved-view") {
        return actions;
      }

      if (item.entityType === "project") {
        const project = item.data as Project | undefined;
        if (!project) return actions;
        const base = `/projects/${project.id}`;
        actions.push(
          create("project.new-issue", labels.newIssue, ListTodo, () => dependencies.openCreateIssue(project.id), 50),
          create("project.new-objective", labels.newObjective, Target, () => dependencies.openCreateObjective(project.id), 40),
          copy("project.copy-key", labels.copyProjectKey, project.key, 20),
          go("project.objectives", labels.openObjectives, Target, `${base}/objectives`, 50),
          go("project.pages", labels.openPages, FileText, `${base}/pages`, 40),
          go("project.triage", labels.openTriage, CircleDashed, `${base}/triage`, 30),
          go("project.feedback", labels.openFeedback, Link2, `${base}/feedback`, 20),
          go("project.settings", labels.openProjectSettings, Settings, `${base}/settings`, 10)
        );
        return actions;
      }

      if (item.entityType === "objective") {
        const objective = item.data as SearchIndexObjective | undefined;
        if (!objective) return actions;
        const base = `/projects/${objective.project_id}`;
        actions.push(
          go("objective.issues", labels.viewObjectiveIssues, ListTodo, `${base}?objective=${objective.id}`, 100),
          create(
            "objective.new-issue",
            labels.newIssueForObjective,
            ListTodo,
            () => dependencies.openCreateIssue(objective.project_id, objective.id),
            50
          ),
          create("objective.new-objective", labels.newObjective, Target, () => dependencies.openCreateObjective(objective.project_id), 20),
          copy("objective.copy-name", labels.copyObjectiveName, item.title, 10),
          go("objective.list", labels.openObjectives, Target, `${base}/objectives`, 50),
          go("objective.project", labels.openProjectBoard, FolderKanban, base, 40)
        );
        return actions;
      }

      if (item.entityType === "page") {
        const page = item.data as SearchIndexPage | undefined;
        if (!page) return actions;
        const base = `/projects/${page.project_id}`;
        actions.push(
          create("page.new-issue", labels.newIssueInProject, ListTodo, () => dependencies.openCreateIssue(page.project_id), 40),
          copy("page.copy-title", labels.copyPageTitle, item.title, 20),
          go("page.index", labels.openPages, FileText, `${base}/pages`, 50),
          go("page.project", labels.openProjectBoard, FolderKanban, base, 40)
        );
        return actions;
      }

      const issue = item.data as SearchIndexIssue | undefined;
      if (!issue) return actions;
      const base = `/projects/${issue.project_id}`;
      actions.push(
        create("issue.new-issue", labels.newIssueInProject, ListTodo, () => dependencies.openCreateIssue(issue.project_id), 20),
        copy("issue.copy-title", labels.copyIssueTitle, item.title, 10),
        go("issue.project", labels.openProjectBoard, FolderKanban, base, 30)
      );
      if (issue.objective_id) {
        actions.push(
          go("issue.objective-issues", labels.viewObjectiveIssues, ListTodo, `${base}?objective=${issue.objective_id}`, 60),
          go("issue.open-objective", labels.openLinkedObjective, Target, `${base}/objectives?open=${issue.objective_id}`, 70)
        );
      }
      return actions;
    },
  };
}
