"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  Delete02Icon,
  File02Icon,
  Layout3ColumnIcon,
  MessageMultiple01Icon,
  Settings01Icon,
  Target01Icon,
  ViewIcon,
  ViewOffIcon,
} from "@hugeicons/core-free-icons";
import { toast } from "mangue-ui";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { ProjectTrashDialog } from "@/components/projects/project-trash-dialog";
import { useAuth } from "@/lib/auth-context";
import { useCreate } from "@/lib/create-context";
import { pageHref, pagesHref, replacePagesHistory } from "@/lib/pages-navigation";
import { forgetDraftPage, markDraftPage } from "@/lib/pages-draft";
import { useAppRouter } from "@/lib/use-app-router";
import { useCreatePage } from "@/lib/use-pages-query";
import { useHiddenProjects } from "@/lib/use-hidden-projects";
import type { Project } from "@/lib/types";

const icon = (data: Parameters<typeof HugeiconsIcon>[0]["icon"]) => (
  <HugeiconsIcon icon={data} className="size-4" />
);

/**
 * "New page" in an explicit project: the page is created, then OPENED, and
 * stays a draft until something is written in it (lib/pages-draft.ts). The
 * command palette and the sidebar share it; the sidebar passes the project
 * that was right-clicked, which need not be the one on screen.
 */
export function useCreateProjectPage(
  navigateToWikiPage: (projectId: string, pageId: string) => void,
): (projectId: string) => void {
  const tPages = useTranslations("Pages");
  const createPage = useCreatePage();
  return useCallback(
    (projectId: string) => {
      void (async () => {
        try {
          const page = await createPage(projectId, {});
          markDraftPage(page.id);
          navigateToWikiPage(projectId, page.id);
          void page.settled.catch((err: unknown) => {
            forgetDraftPage(page.id);
            if (window.location.pathname === pageHref(projectId, page.id)) {
              replacePagesHistory(pagesHref(projectId));
            }
            toast.error(err instanceof Error ? err.message : tPages("createFailed"));
          });
        } catch (err) {
          toast.error(err instanceof Error ? err.message : tPages("createFailed"));
        }
      })();
    },
    [createPage, navigateToWikiPage, tPages],
  );
}

const ProjectActionsContext = createContext<((project: Project) => ContextMenuAction[]) | null>(null);

/**
 * Hands the shell's project actions to rows rendered deep inside the sidebar
 * (the project switcher row on desktop and mobile) without threading them
 * through every sidebar layer.
 */
export const ProjectContextActionsProvider = ProjectActionsContext.Provider;

export function useProjectRowActions(project: Project | null | undefined): ContextMenuAction[] {
  const build = useContext(ProjectActionsContext);
  return useMemo(() => (project && build ? build(project) : []), [build, project]);
}

/** The project tabs whose sidebar row offers a creation entry. */
export type ProjectTabKind = "tickets" | "objectives" | "pages" | "feedback";

export interface ProjectContextActions {
  /**
   * A "New" submenu, settings, the personal Hide/Show project entry and, for
   * the owner, Move to trash (last).
   */
  projectActions: (project: Project) => ContextMenuAction[];
  /** The creation entry of one project tab ("New objective" on Objectives…). */
  tabActions: (project: Project, tab: ProjectTabKind) => ContextMenuAction[];
  /** The trash confirmation; render it once next to the sidebar. */
  dialog: ReactNode;
}

/**
 * Right-click actions for project rows (MIN-685). Every action is bound to
 * the project passed in, never to the route: the home panel lists every
 * project, and acting on the one under the pointer is the whole point.
 */
export function useProjectContextActions({
  createProjectPage,
}: {
  createProjectPage: (projectId: string) => void;
}): ProjectContextActions {
  const t = useTranslations("Nav");
  const tc = useTranslations("Common");
  const tPages = useTranslations("Pages");
  const tFeedback = useTranslations("FeedbackBoard");
  const { user } = useAuth();
  const { openCreateIssue, openCreateObjective } = useCreate();
  const router = useAppRouter();
  const pathname = usePathname();
  const { isHidden, setProjectHidden } = useHiddenProjects();
  const [trashTarget, setTrashTarget] = useState<Project | null>(null);

  const createActions = useCallback(
    (project: Project): Record<ProjectTabKind, ContextMenuAction> => ({
      tickets: {
        id: "project-new-issue",
        label: t("newIssue"),
        icon: icon(Layout3ColumnIcon),
        transfersFocus: true,
        onSelect: () => openCreateIssue({ projectId: project.id }),
      },
      objectives: {
        id: "project-new-objective",
        label: t("newObjective"),
        icon: icon(Target01Icon),
        transfersFocus: true,
        onSelect: () => openCreateObjective({ projectId: project.id }),
      },
      pages: {
        id: "project-new-page",
        label: tPages("newPage"),
        icon: icon(File02Icon),
        onSelect: () => createProjectPage(project.id),
      },
      feedback: {
        id: "project-new-feedback",
        label: tFeedback("newFeedback"),
        icon: icon(MessageMultiple01Icon),
        // The composer lives on the feedback page, which owns its members
        // and board settings; `?new=1` asks that page to open it once.
        onSelect: () => router.push(`/projects/${project.id}/feedback?new=1`),
      },
    }),
    [createProjectPage, openCreateIssue, openCreateObjective, router, t, tFeedback, tPages],
  );

  const projectActions = useCallback(
    (project: Project): ContextMenuAction[] => {
      const create = createActions(project);
      const actions: ContextMenuAction[] = [
        {
          id: "project-new",
          label: t("new"),
          icon: icon(Add01Icon),
          children: [create.tickets, create.objectives, create.pages],
        },
        {
          id: "project-settings",
          label: t("projectSettings"),
          icon: icon(Settings01Icon),
          onSelect: () => router.push(`/projects/${project.id}/settings`),
        },
        // A personal preference (MIN-692), open to every member: it only
        // changes my own navigation, so it is never presented as destructive.
        isHidden(project.id)
          ? {
            id: "project-show",
            label: t("showProject"),
            icon: icon(ViewIcon),
            onSelect: () => { void setProjectHidden(project, false); },
          }
          : {
            id: "project-hide",
            label: t("hideProject"),
            icon: icon(ViewOffIcon),
            onSelect: () => { void setProjectHidden(project, true); },
          },
      ];
      // Same rule as the settings' danger zone: only the owner may trash.
      if (user && project.owner_id === user.id) {
        actions.push({
          id: "project-trash",
          label: tc("moveToTrash"),
          icon: icon(Delete02Icon),
          variant: "destructive",
          transfersFocus: true,
          onSelect: () => setTrashTarget(project),
        });
      }
      return actions;
    },
    [createActions, isHidden, router, setProjectHidden, t, tc, user],
  );

  const tabActions = useCallback(
    (project: Project, tab: ProjectTabKind) => [createActions(project)[tab]],
    [createActions],
  );

  const onTrashed = useCallback(
    (projectId: string) => {
      // Leave only a screen that belongs to the trashed project.
      const base = `/projects/${projectId}`;
      if (pathname === base || pathname.startsWith(`${base}/`)) router.replace("/home");
    },
    [pathname, router],
  );

  const dialog = (
    <ProjectTrashDialog
      project={trashTarget}
      open={trashTarget !== null}
      onOpenChange={(open) => { if (!open) setTrashTarget(null); }}
      onTrashed={onTrashed}
    />
  );

  return useMemo(
    () => ({ projectActions, tabActions, dialog }),
    // `dialog` is a fresh element each render; it only depends on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectActions, tabActions, trashTarget, onTrashed],
  );
}
