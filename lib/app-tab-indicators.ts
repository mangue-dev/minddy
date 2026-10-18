import type { ProjectTriageCount } from "@/lib/types";

/**
 * What a tab's icon carries (MIN-695): the badge of its page's sidebar entry,
 * from the same data and with the same scope. Home's tab shows the Smart
 * Assign warning, like the Home row; a project's Triage and Feedback tabs
 * show that project's counters, never another project's.
 */
export type AppTabIndicator =
  | { kind: "alert" }
  | {
      kind: "count";
      count: number;
      label: "pullRequestsBadge" | "inboxBadge" | "triageBadge" | "feedbackBadge";
    };

export interface AppTabIndicatorData {
  /** Open pull requests, already zero when the plan has no agents. */
  openPullRequests: number;
  /** Unread notifications plus pending invitations, as on the Inbox row. */
  inbox: number;
  smartAssignWarning: boolean;
  triageCounts: Record<string, ProjectTriageCount>;
}

export function appTabIndicator(
  route: { section: string; projectId?: string | null },
  data: AppTabIndicatorData,
): AppTabIndicator | null {
  const count = (
    value: number,
    label: Extract<AppTabIndicator, { kind: "count" }>["label"],
  ): AppTabIndicator | null => (value > 0 ? { kind: "count", count: value, label } : null);

  if (route.projectId) {
    const project = data.triageCounts[route.projectId];
    if (route.section === "triage") return count(project?.triage ?? 0, "triageBadge");
    if (route.section === "feedback") return count(project?.feedback ?? 0, "feedbackBadge");
    return null;
  }
  switch (route.section) {
    case "home":
      return data.smartAssignWarning ? { kind: "alert" } : null;
    case "inbox":
      return count(data.inbox, "inboxBadge");
    case "pull-requests":
      return count(data.openPullRequests, "pullRequestsBadge");
    default:
      return null;
  }
}
