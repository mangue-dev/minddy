"use client";

import { AppIcon } from "@/components/icon";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { PR_STATE_ICONS, PR_STATE_STYLES } from "@/components/pull-requests/pr-state-styles";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EditablePrState } from "@/lib/pr-state-transition";
import type { PullRequestListItem } from "@/lib/agent-api";

/**
 * Status badge of a pull request — only one place, for the list as for
 * the detail (both painted it separately, and not the same). Its colors and
 * icons come from `pr-state-styles.ts`.
 *
 * The SHAPE remains that of minddy's badges: tint at 10%, no border — the
 * borderless badge that the landing-page page illustrations use.
 */

type PrState = PullRequestListItem["pr_state"];

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
  const Icon = PR_STATE_ICONS[state];

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
      <AppIcon icon={PR_STATE_ICONS[next]} className={cn(PR_STATE_STYLES[next], "bg-transparent dark:bg-transparent")} />
      {t(STATE_LABELS[next])}
    </DropdownMenuItem>
  ));
  if (inMenu) {
    const label = <><AppIcon icon={PR_STATE_ICONS[state]} className={cn(PR_STATE_STYLES[state], "bg-transparent dark:bg-transparent")} />{t(STATE_LABELS[state])}</>;
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
          <AppIcon icon={PR_STATE_ICONS[state]} />
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
