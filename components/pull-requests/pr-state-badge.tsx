"use client";

import { AppIcon } from "@/components/icon";
import { ArrowDown01Icon, GitMergeIcon as GitMerge, GitPullRequestClosedIcon as GitPullRequestClosed, GitPullRequestDraftIcon as GitPullRequestDraft, GitPullRequestIcon as GitPullRequest } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent, cn } from "mangue-ui";
import type { EditablePrState } from "@/lib/pr-state-transition";
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
 * The SHAPE, for its part, remains that of minddy's badges: tint at 10%, no
 * border — the borderless badge that the landing-page page illustrations use.
 *
 * `PR_STATE_STYLES` is exported because the status of a PR reads ELSEWHERE than
 * in this badge — the list of agent sessions, the header of a conversation —
 * and that these places in turn repainted in green the “merged” that
 * GitHub puts in purple. A single table, and the code remains readable everywhere.
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

const STATE_ICONS: Record<PrState, AppIcon> = {
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

const STATE_CONTROL_STYLES: Record<EditablePrState, string> = {
  open: "hover:bg-green-600/15 hover:text-green-700 aria-expanded:bg-green-600/15 aria-expanded:text-green-700 focus-visible:bg-green-600/15 dark:hover:bg-green-500/20 dark:hover:text-green-400 dark:aria-expanded:bg-green-500/20 dark:aria-expanded:text-green-400 dark:focus-visible:bg-green-500/20",
  closed: "hover:bg-destructive/15 hover:text-destructive aria-expanded:bg-destructive/15 aria-expanded:text-destructive focus-visible:bg-destructive/15 dark:hover:bg-destructive/20 dark:aria-expanded:bg-destructive/20 dark:focus-visible:bg-destructive/20",
  draft: "bg-muted text-muted-foreground",
};

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
      icon={icon ? <AppIcon icon={Icon} /> : undefined}
      className={cn(PR_STATE_STYLES[state], className)}
    >
      {t(STATE_LABELS[state])}
    </Badge>
  );
}

/** Editable detail status; merged and read-only PRs retain their badge. */
export function PrStateControl({ state, canChange, disabled, onChange, inMenu = false }: {
  inMenu?: boolean;
  state: PrState;
  canChange: boolean;
  disabled: boolean;
  onChange: (state: EditablePrState) => void;
}) {
  const t = useTranslations("PullRequests");
  const options = (["draft", "open", "closed"] as const).map((next) => (
    <DropdownMenuItem key={next} disabled={next === state || disabled}
      onSelect={() => onChange(next)} data-testid={`pr-state-${next}`}>
      <AppIcon icon={STATE_ICONS[next]} className={cn(PR_STATE_STYLES[next], "bg-transparent dark:bg-transparent")} />
      {t(STATE_LABELS[next])}
    </DropdownMenuItem>
  ));
  if (inMenu) {
    const label = <><AppIcon icon={STATE_ICONS[state]} className={cn(PR_STATE_STYLES[state], "bg-transparent dark:bg-transparent")} />{t(STATE_LABELS[state])}</>;
    if (state === "merged" || !canChange) return <DropdownMenuItem disabled className="app-desktop:hidden">{label}</DropdownMenuItem>;
    return <DropdownMenuSub>
      <DropdownMenuSubTrigger className="app-desktop:hidden" disabled={disabled} data-testid="pr-state-menu">{label}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent>{options}</DropdownMenuSubContent>
    </DropdownMenuSub>;
  }
  if (state === "merged" || !canChange) return <PrStateBadge state={state} icon className="h-8" />;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          data-testid="pr-state-control"
          className={cn(PR_STATE_STYLES[state], STATE_CONTROL_STYLES[state], "h-8 gap-1.5")}
        >
          <AppIcon icon={STATE_ICONS[state]} />
          {t(STATE_LABELS[state])}
          <AppIcon icon={ArrowDown01Icon} className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {options}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
