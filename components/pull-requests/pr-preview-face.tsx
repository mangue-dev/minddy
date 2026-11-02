"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CancelCircleIcon, CheckmarkCircle02Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { useTranslations } from "next-intl";
import { AppIcon } from "@/components/icon";
import { Github, Gitlab } from "@/components/git/provider-icons";
import { PR_STATE_ICONS, PR_STATE_STYLES } from "@/components/pull-requests/pr-state-styles";
import { Skeleton } from "@/components/ui/skeleton";
import type { IssuePr } from "@/lib/agent-api";
import type { PrPreviewChecks } from "@/lib/pr-preview-checks";
import type { RepoProviderId } from "@/lib/repo-providers";
import { cn } from "@/lib/utils";

const STATE_LABELS = {
  draft: "prStateDraft",
  open: "prStateOpen",
  merged: "prStateMerged",
  closed: "prStateClosed",
} as const satisfies Record<IssuePr["state"], string>;

const CHECKS = {
  passed: { key: "prChecksPassed", icon: CheckmarkCircle02Icon, tone: "text-green-600 dark:text-green-500" },
  running: { key: "prChecksRunning", icon: Clock01Icon, tone: "text-amber-600 dark:text-amber-500" },
  failed: { key: "prChecksFailed", icon: CancelCircleIcon, tone: "text-destructive" },
} as const;

/**
 * A pull request as its hover card shows it (MIN-888): the forge and the
 * repository, the state badge, the title and number, then where CI stands.
 * The landing's “Merge, minddy follows” figure draws the same face, so the
 * site and the app never show two versions of it.
 *
 * Only the `Agent` namespace is read: the landing's figures ship it, not
 * `PullRequests`. `checks` is `loading` while the readiness is read, and
 * `null` when there is nothing true to say about CI.
 */
export function PullRequestPreviewFace({
  provider,
  repository,
  state,
  title,
  number,
  checks,
  checksLabel,
  pending = false,
  oneLineTitle = false,
}: {
  provider: RepoProviderId | null;
  repository: string | null;
  state: IssuePr["state"];
  title: string | null;
  number: number;
  checks: PrPreviewChecks | "loading" | null;
  /** Replaces the computed CI line: the landing's own copy. */
  checksLabel?: string;
  /** The repository and title are still being read. */
  pending?: boolean;
  /** The landing's figure stacks an issue card under it: one line, cut. */
  oneLineTitle?: boolean;
}) {
  const t = useTranslations("Agent");
  const Forge = provider === "gitlab" ? Gitlab : Github;
  return (
    <div className="flex min-w-0 flex-col">
      <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
        {provider && <Forge className="size-3.5 shrink-0" />}
        {pending ? <Skeleton className="h-3 w-24" /> : <span className="min-w-0 truncate">{repository}</span>}
        <span
          className={cn(
            "ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium",
            PR_STATE_STYLES[state] || "bg-secondary text-secondary-foreground",
          )}
        >
          <AppIcon icon={PR_STATE_ICONS[state]} className="size-3" />
          {t(STATE_LABELS[state])}
        </span>
      </div>
      {pending ? (
        <Skeleton className="mt-2 h-4 w-3/4" />
      ) : (
        <p className={cn("mt-2 font-medium", oneLineTitle ? "truncate" : "line-clamp-2 break-words")}>
          {title ? <>{title} </> : null}
          <span className="font-normal text-muted-foreground">#{number}</span>
        </p>
      )}
      {checks === "loading" ? (
        <Skeleton className="mt-2 h-3.5 w-1/2" />
      ) : checks ? (
        <p className="mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <HugeiconsIcon icon={CHECKS[checks.status].icon} className={cn("size-3.5 shrink-0", CHECKS[checks.status].tone)} />
          <span className="shrink-0">{checksLabel ?? t(CHECKS[checks.status].key, { count: checks.count })}</span>
          {checks.names.length > 0 && (
            <span className="min-w-0 truncate">· {checks.names.join(", ")}</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
