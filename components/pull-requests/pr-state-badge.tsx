"use client";

import { useTranslations } from "next-intl";
import { Badge, cn } from "mangue-ui";
import {
  GitMerge,
  GitPullRequest,
  GitPullRequestClosed,
  GitPullRequestDraft,
  type LucideIcon,
} from "lucide-react";
import type { PullRequestListItem } from "@/lib/agent-api";

/**
 * Status badge of a pull request — only one place, for the list as for
 * the detail (both painted it separately, and not the same).
 *
 * COLORS are those of GitHub: open green, merged purple, red
 * closed, gray draft. It's not a palette that an app customizes —
 * it's a code that the user already reads elsewhere, and translating it to them into
 * house colors would cost them a round trip for each glance. The icon
 * follows the same logic: GitHub has one per state, and it carries the information
 * without the color (so without excluding who does not distinguish it).
 *
 * The SHAPE, for its part, remains that of minddy's badges: tint at 10%, edge at
 * 20%, never a solid — that's what we have.
 *
 * `PR_STATE_STYLES` is exported because the status of a PR reads ELSEWHERE than
 * in this badge — the list of agent sessions, the header of a conversation —
 * and that these places in turn repainted in green the “merged” that
 * GitHub puts in purple. A single table, and the code remains readable everywhere.
 */

type PrState = PullRequestListItem["pr_state"];

export const PR_STATE_STYLES: Record<PrState, string> = {
  open: "border-green-600/20 bg-green-600/10 text-green-700 dark:border-green-500/25 dark:bg-green-500/15 dark:text-green-400",
  merged:
    "border-violet-600/20 bg-violet-600/10 text-violet-700 dark:border-violet-500/25 dark:bg-violet-500/15 dark:text-violet-400",
  closed:
    "border-destructive/20 bg-destructive/10 text-destructive dark:bg-destructive/15",
  // The draft keeps the gray of `secondary`: it is already that of GitHub.
  draft: "",
};

const STATE_ICONS: Record<PrState, LucideIcon> = {
  open: GitPullRequest,
  merged: GitMerge,
  closed: GitPullRequestClosed,
  draft: GitPullRequestDraft,
};

const STATE_LABELS = {
  open: "stateOpen",
  merged: "stateMerged",
  closed: "stateClosed",
  draft: "stateDraft",
} as const satisfies Record<PrState, string>;

export function PrStateBadge({
  state,
  /** Status icon — out of the list, where the badge fits 10 px high. */
  icon = false,
  className,
}: {
  state: PrState;
  icon?: boolean;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const Icon = STATE_ICONS[state];

  return (
    <Badge
      variant="secondary"
      icon={icon ? <Icon /> : undefined}
      className={cn(PR_STATE_STYLES[state], className)}
    >
      {t(STATE_LABELS[state])}
    </Badge>
  );
}
