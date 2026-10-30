import { projectHref, pullRequestHref, recordRef, routineHref, withQuery } from "./app-urls";
import { GitMergeIcon, GitPullRequestIcon, InboxIcon } from "@hugeicons/core-free-icons";
import { BOARD_ICON, ROUTINE_ICON } from "@/components/feature-icons";
import type { PaletteGroup, PaletteItem } from "@/components/header-search-pill";
import type { PullRequestListItem } from "./agent-api";
import type { Routine } from "./routines-api";
import type { MyNotification, Project, View } from "./types";

/**
 * The palette rows of the workspace's other objects (MIN-846): routines, pull
 * requests, board views and inbox notifications.
 *
 * Every row is `searchOnly`: the list shown before typing stays the commands,
 * the screens and the project data; these rows answer a query. Each kind
 * reads the cache its own surface keeps (lib/use-routines-query.ts, the Pull
 * requests list, the board views, the inbox), so the palette never holds a
 * second copy that could disagree with the screen it opens.
 *
 * PURE module: the translated labels and the navigation come in as parameters.
 */

type PaletteProject = Pick<Project, "id" | "name" | "key">;

export interface WorkspaceGroupLabels {
  routines: string;
  pullRequests: string;
  views: string;
  notifications: string;
  /** Where a global view lives: the cross-project board. */
  globalBoard: string;
  notificationTitle: (notification: MyNotification) => string;
  notificationLine: (notification: MyNotification) => string;
}

export interface WorkspaceGroupInput {
  routines: readonly Pick<Routine, "id" | "project_id" | "title">[];
  pullRequests: readonly PullRequestListItem[];
  /** Global views and the current project's views. */
  views: readonly Pick<View, "id" | "project_id" | "name">[];
  notifications: readonly MyNotification[];
  /** The projects the palette may show (hidden ones excluded, MIN-751). */
  projectById: ReadonlyMap<string, PaletteProject>;
  labels: WorkspaceGroupLabels;
  navigate: (href: string) => void;
  openNotification: (notificationId: string) => void;
}

/** A row tied to a hidden or unknown project stays out, like a ticket's. */
function visibleProject(
  projectById: ReadonlyMap<string, PaletteProject>,
  projectId: string | null | undefined,
): PaletteProject | null | undefined {
  if (!projectId) return null;
  return projectById.get(projectId);
}

function projectKeywords(project: PaletteProject | null): string[] {
  return project ? [project.name, project.key] : [];
}

export { pullRequestHref, routineHref };

export function viewHref(view: Pick<View, "id" | "project_id">): string {
  const query = { view: recordRef(view.id) };
  return view.project_id ? projectHref(view.project_id, undefined, query) : withQuery("/all", query);
}

export function buildWorkspaceGroups(input: WorkspaceGroupInput): PaletteGroup[] {
  const { projectById, labels, navigate } = input;
  const groups: PaletteGroup[] = [];

  const routineRows = input.routines.flatMap((routine): PaletteItem[] => {
    const project = visibleProject(projectById, routine.project_id);
    if (!project) return [];
    const href = routineHref(routine.id);
    return [{
      key: `routine-${routine.id}`,
      label: routine.title,
      icon: ROUTINE_ICON,
      keywords: projectKeywords(project),
      metaText: project.name,
      contextId: project.id,
      entityType: "navigation",
      searchOnly: true,
      href,
      onSelect: () => navigate(href),
    }];
  });
  if (routineRows.length > 0) {
    groups.push({ key: "routines", heading: labels.routines, items: routineRows });
  }

  const pullRequestRows = input.pullRequests.flatMap((pr): PaletteItem[] => {
    // A repository linked to no visible project still lists its PRs on the
    // Pull requests page; only a hidden project's PRs leave the palette.
    const project = pr.project ? visibleProject(projectById, pr.project.id) : null;
    if (project === undefined) return [];
    const number = `#${pr.pr_number}`;
    const href = pullRequestHref(pr.prId);
    return [{
      key: `pull-request-${pr.prId}`,
      label: pr.title || number,
      icon: pr.pr_state === "merged" ? GitMergeIcon : GitPullRequestIcon,
      keywords: [
        number,
        String(pr.pr_number),
        ...(pr.head_branch ? [pr.head_branch] : []),
        ...(pr.author ? [pr.author.login] : []),
        ...projectKeywords(project),
      ],
      metaText: number,
      contextId: project?.id,
      entityType: "navigation",
      searchOnly: true,
      href,
      onSelect: () => navigate(href),
    }];
  });
  if (pullRequestRows.length > 0) {
    groups.push({ key: "pull-requests", heading: labels.pullRequests, items: pullRequestRows });
  }

  const viewRows = input.views.flatMap((view): PaletteItem[] => {
    const project = visibleProject(projectById, view.project_id);
    if (project === undefined) return [];
    const href = viewHref(view);
    return [{
      key: `view-${view.id}`,
      label: view.name,
      icon: BOARD_ICON,
      keywords: project ? projectKeywords(project) : [labels.globalBoard],
      metaText: project?.name ?? labels.globalBoard,
      contextId: project?.id,
      entityType: "navigation",
      searchOnly: true,
      href,
      onSelect: () => navigate(href),
    }];
  });
  if (viewRows.length > 0) {
    groups.push({ key: "board-views", heading: labels.views, items: viewRows });
  }

  // A notification opens the inbox on its row rather than its target: the
  // search was for the notification, and the row still leads to the target.
  const notificationRows = input.notifications.flatMap((notification): PaletteItem[] => {
    const project = visibleProject(projectById, notification.project_id);
    if (project === undefined) return [];
    const identifier =
      notification.project_key && notification.issue_number != null
        ? `${notification.project_key}-${notification.issue_number}`
        : notification.pull_request_number != null
          ? `#${notification.pull_request_number}`
          : undefined;
    return [{
      key: `notification-${notification.id}`,
      label: labels.notificationTitle(notification),
      description: labels.notificationLine(notification),
      icon: InboxIcon,
      keywords: [...(identifier ? [identifier] : []), ...projectKeywords(project)],
      metaText: identifier,
      contextId: project?.id,
      entityType: "notification",
      searchOnly: true,
      data: notification,
      onSelect: () => input.openNotification(notification.id),
    }];
  });
  if (notificationRows.length > 0) {
    groups.push({ key: "notifications", heading: labels.notifications, items: notificationRows });
  }

  return groups;
}
