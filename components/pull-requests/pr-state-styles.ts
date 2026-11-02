import { GitMergeIcon, GitPullRequestClosedIcon, GitPullRequestDraftIcon, GitPullRequestIcon } from "@hugeicons/core-free-icons";
import type { AppIcon } from "@/components/icon";
import type { PullRequestListItem } from "@/lib/agent-api";

/**
 * The colors and icon of each pull request state, without a label: the
 * badge (`pr-state-badge.tsx`) and the landing's figures, which ship without
 * the `PullRequests` catalog, paint a state the same way.
 *
 * COLORS are those of GitHub: open green, merged purple, red
 * closed, gray draft. It's not a palette that an app customizes —
 * it's a code that the user already reads elsewhere, and translating it to them into
 * house colors would cost them a round trip for each glance. The icon
 * follows the same logic: GitHub has one per state, and it carries the information
 * without the color (so without excluding who does not distinguish it).
 *
 * The status of a PR reads ELSEWHERE than in the badge — the list of agent
 * sessions, the header of a conversation, the hover card of an issue's PR —
 * and these places in turn repainted in green the “merged” that GitHub puts
 * in purple. A single table, and the code remains readable everywhere.
 */

type PrState = PullRequestListItem["pr_state"];

export const PR_STATE_STYLES: Record<PrState, string> = {
  open: "bg-green-600/10 text-green-700 dark:bg-green-500/15 dark:text-green-400",
  merged:
    "bg-violet-600/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  closed: "bg-destructive/10 text-destructive dark:bg-destructive/15",
  // The draft keeps the gray of `secondary`: it is already that of GitHub.
  draft: "",
};

export const PR_STATE_ICONS: Record<PrState, AppIcon> = {
  open: GitPullRequestIcon,
  merged: GitMergeIcon,
  closed: GitPullRequestClosedIcon,
  draft: GitPullRequestDraftIcon,
};
