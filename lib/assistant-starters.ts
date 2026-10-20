import {
  Add01Icon,
  AiMagicIcon,
  AlertCircleIcon,
  Analytics01Icon,
  ArrowTurnBackwardIcon,
  BulbIcon,
  Calendar03Icon,
  ChartLineData01Icon,
  CheckListIcon,
  Clock01Icon,
  Copy01Icon,
  CreditCardIcon,
  DashboardSpeed01Icon,
  Delete02Icon,
  File01Icon,
  GitBranchIcon,
  GitMergeIcon,
  GitPullRequestIcon,
  InboxIcon,
  Layers01Icon,
  MailReply01Icon,
  MessageMultiple01Icon,
  Notification01Icon,
  PencilEdit02Icon,
  RepeatIcon,
  Search01Icon,
  Settings02Icon,
  SourceCodeIcon,
  SplitIcon,
  Tag01Icon,
  Target02Icon,
  TaskEdit01Icon,
  ThumbsUpIcon,
  UserAdd01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";
import type { AssistantPageContext } from "@/lib/assistant-types";

/**
 * Which surface the empty Numo composer is opened over. Each one gets its own
 * four suggestions (`Assistant.starters.<page>` in every catalog).
 */
export type AssistantStarterPage =
  | "general"
  | "home"
  | "inbox"
  | "all"
  | "board"
  | "triage"
  | "objectives"
  | "pages"
  | "page"
  | "feedback"
  | "projectSettings"
  | "issue"
  | "routines"
  | "pullRequests"
  | "statistics"
  | "settings"
  | "billing"
  | "trash";

export const ASSISTANT_STARTER_KEYS = ["s1", "s2", "s3", "s4"] as const;
export type AssistantStarterKey = (typeof ASSISTANT_STARTER_KEYS)[number];

/** One color per row, so the rows read the same way on every page. */
const ROW_COLORS: Record<AssistantStarterKey, string> = {
  s1: "text-blue-600 dark:text-blue-400",
  s2: "text-violet-600 dark:text-violet-400",
  s3: "text-emerald-600 dark:text-emerald-400",
  s4: "text-rose-600 dark:text-rose-400",
};

type StarterIcons = readonly [IconSvgElement, IconSvgElement, IconSvgElement, IconSvgElement];

const STARTER_ICONS: Record<AssistantStarterPage, StarterIcons> = {
  general: [Search01Icon, Add01Icon, TaskEdit01Icon, BulbIcon],
  home: [Target02Icon, Clock01Icon, AlertCircleIcon, Add01Icon],
  inbox: [InboxIcon, Notification01Icon, MailReply01Icon, Add01Icon],
  all: [Search01Icon, TaskEdit01Icon, Clock01Icon, Calendar03Icon],
  board: [DashboardSpeed01Icon, Add01Icon, AlertCircleIcon, SplitIcon],
  triage: [CheckListIcon, Copy01Icon, AlertCircleIcon, Target02Icon],
  objectives: [ChartLineData01Icon, Target02Icon, AlertCircleIcon, Layers01Icon],
  pages: [Search01Icon, PencilEdit02Icon, File01Icon, Layers01Icon],
  page: [File01Icon, PencilEdit02Icon, CheckListIcon, AiMagicIcon],
  feedback: [MessageMultiple01Icon, ThumbsUpIcon, MailReply01Icon, Add01Icon],
  projectSettings: [Settings02Icon, Tag01Icon, GitBranchIcon, UserAdd01Icon],
  issue: [File01Icon, CheckListIcon, SplitIcon, PencilEdit02Icon],
  routines: [RepeatIcon, Clock01Icon, BulbIcon, PencilEdit02Icon],
  pullRequests: [GitPullRequestIcon, SourceCodeIcon, MailReply01Icon, GitMergeIcon],
  statistics: [Analytics01Icon, ChartLineData01Icon, Calendar03Icon, AlertCircleIcon],
  settings: [Settings02Icon, Notification01Icon, GitBranchIcon, SourceCodeIcon],
  billing: [CreditCardIcon, DashboardSpeed01Icon, Layers01Icon, Settings02Icon],
  trash: [Delete02Icon, ArrowTurnBackwardIcon, Search01Icon, Clock01Icon],
};

export const ASSISTANT_STARTER_PAGES = Object.keys(STARTER_ICONS) as AssistantStarterPage[];

export interface AssistantStarter {
  key: AssistantStarterKey;
  icon: IconSvgElement;
  iconClassName: string;
}

export function assistantStarters(page: AssistantStarterPage): AssistantStarter[] {
  return ASSISTANT_STARTER_KEYS.map((key, index) => ({
    key,
    icon: STARTER_ICONS[page][index],
    iconClassName: ROW_COLORS[key],
  }));
}

const PROJECT_ROUTES: Record<string, AssistantStarterPage> = {
  triage: "triage",
  objectives: "objectives",
  pages: "pages",
  "pages-print": "page",
  feedback: "feedback",
  settings: "projectSettings",
};

const ACCOUNT_ROUTES: Record<string, AssistantStarterPage> = {
  home: "home",
  inbox: "inbox",
  all: "all",
  routines: "routines",
  "pull-requests": "pullRequests",
  statistics: "statistics",
  settings: "settings",
  billing: "billing",
  trash: "trash",
};

/**
 * Resolves the suggestion set from the route under the composer. An issue open
 * in the side panel wins over its board, since that is what the user reads.
 * Authenticated routes carry no locale prefix, so the pathname is canonical.
 */
export function assistantStarterPage(
  pathname: string | null | undefined,
  pageContext?: AssistantPageContext | null,
): AssistantStarterPage {
  if (pageContext?.issueId) return "issue";
  const segments = (pathname ?? "").split("/").filter(Boolean);
  if (segments[0] === "projects" && segments[1]) {
    const section = segments[2];
    if (!section) return "board";
    if (section === "pages" && segments[3]) return "page";
    return PROJECT_ROUTES[section] ?? "general";
  }
  return ACCOUNT_ROUTES[segments[0] ?? ""] ?? "general";
}
