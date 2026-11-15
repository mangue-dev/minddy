import {
  CircleDotDashedIcon,
  File02Icon,
  MessageMultiple01Icon,
  Settings01Icon,
  Target01Icon,
} from "@hugeicons/core-free-icons";
import { AppIcon } from "@/components/icon";
import { BOARD_ICON } from "@/components/feature-icons";
import type { ProjectTabKind } from "@/components/project-context-actions";
import { projectPath, type ProjectTab } from "@/lib/app-urls";
import type { ProjectTriageCount } from "@/lib/types";

/**
 * The project panel's first row: back to Home, which the desktop sidebar
 * renders as the project switcher (components/app-sidebar.tsx).
 */
export const HOME_BACK_NAV_KEY = "home-back";

/** A project's row in the home panel, and back (MIN-968 reorders by it). */
const PROJECT_NAV_KEY_PREFIX = "project-";
export const projectNavKey = (projectId: string) => `${PROJECT_NAV_KEY_PREFIX}${projectId}`;
/** The project a home-panel row opens, or null for any other row. */
export function projectIdFromNavKey(key: string): string | null {
  return key.startsWith(PROJECT_NAV_KEY_PREFIX) ? key.slice(PROJECT_NAV_KEY_PREFIX.length) : null;
}

const TriageNavIcon = ({ className }: { className?: string }) => (
  <AppIcon icon={CircleDotDashedIcon} className={className} strokeWidth={2.25} />
);
TriageNavIcon.displayName = "TriageNavIcon";

export type ProjectNavTab = "tickets" | ProjectTab;
type ProjectNavLabelKey = Exclude<ProjectNavTab, "settings"> | "projectSettings";
type ProjectNavBadgeKey = "triageBadge" | "feedbackBadge";

interface ProjectNavTabSpec {
  key: ProjectNavTab;
  labelKey: ProjectNavLabelKey;
  icon: AppIcon;
  /** Second key of the `G` chord (lib/keyboard/keyboard-context.tsx). */
  shortcut: string;
  /** The tab whose creation action the row's context menu offers. */
  contextTab?: ProjectTabKind;
  /** Which half of the project's triage count the row carries. */
  badge?: { half: keyof ProjectTriageCount; labelKey: ProjectNavBadgeKey };
}

/**
 * A project's screens, in the order both the sidebar and the phone sheet show
 * them. The wiki sits between Objectives and Triage: it reads with where the
 * project is going, while the queues and their counters stay together below.
 */
export const PROJECT_NAV_TABS: readonly ProjectNavTabSpec[] = [
  // P (project): B is the all-project board, from a project too.
  { key: "tickets", labelKey: "tickets", icon: BOARD_ICON, shortcut: "P", contextTab: "tickets" },
  { key: "objectives", labelKey: "objectives", icon: Target01Icon, shortcut: "O", contextTab: "objectives" },
  { key: "pages", labelKey: "pages", icon: File02Icon, shortcut: "W", contextTab: "pages" },
  { key: "triage", labelKey: "triage", icon: TriageNavIcon, shortcut: "T",
    badge: { half: "triage", labelKey: "triageBadge" } },
  { key: "feedback", labelKey: "feedback", icon: MessageMultiple01Icon, shortcut: "F", contextTab: "feedback",
    badge: { half: "feedback", labelKey: "feedbackBadge" } },
  { key: "settings", labelKey: "projectSettings", icon: Settings01Icon, shortcut: "S" },
];

export interface ProjectNavEntry extends Omit<ProjectNavTabSpec, "badge"> {
  href: string;
  active: boolean;
  /** Every tab but the board opens a deeper level (the page's own bar or panel). */
  descends: boolean;
  /** Absent when there is nothing to count. */
  badge?: { count: number; labelKey: ProjectNavBadgeKey };
}

export interface ProjectNavLocation {
  /** The location shown, pending navigation included. */
  pathname: string;
  /** The project the location belongs to. */
  currentProjectId: string | null;
  /** The objective filtering the board (lib/objective-board-route.ts). */
  objectiveBoardId: string | null;
}

/**
 * One project's navigation rows, shared by the desktop sidebar and the phone
 * sheet. The badges read `/api/me/triage-counts`, the source of the project's
 * row on Home: entering a project splits that number into exactly its Triage
 * and Feedback badges.
 */
export function projectNavEntries(
  projectId: string,
  location: ProjectNavLocation,
  counts: ProjectTriageCount | undefined,
): ProjectNavEntry[] {
  const { pathname } = location;
  const base = projectPath(projectId);
  // A board filtered by an objective belongs to the Objectives tab.
  const onObjectiveBoard = location.objectiveBoardId != null && location.currentProjectId === projectId;
  return PROJECT_NAV_TABS.map(({ badge, ...tab }) => {
    const href = tab.key === "tickets" ? base : projectPath(projectId, tab.key);
    const active = tab.key === "tickets"
      ? pathname === base && !onObjectiveBoard
      : pathname.startsWith(href) || (tab.key === "objectives" && onObjectiveBoard);
    const count = badge ? (counts?.[badge.half] ?? 0) : 0;
    return {
      ...tab,
      href,
      active,
      descends: tab.key !== "tickets",
      ...(badge && count > 0 ? { badge: { count, labelKey: badge.labelKey } } : {}),
    };
  });
}
