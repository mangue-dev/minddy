"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { AlertCircleIcon, ArrowDown01Icon, ArrowRight01Icon, Clock01Icon, CheckIcon } from "@hugeicons/core-free-icons";
import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { PointerAnchor } from "@/components/pointer-anchor";
import { ChecksDonut } from "@/components/pull-requests/pr-insights";
import type { ChecksSummary } from "@/lib/agent-api";

import type {
  MergeMethod,
  PullRequestReadiness,
  ReadinessAction,
  ReadinessBlocker,
  ReadinessPassedCondition,
  PullRequestReadinessState,
} from "@/lib/pr-readiness";
import type { MessageKey } from "@/lib/i18n-keys";

const STATE_KEYS: Record<
  PullRequestReadinessState,
  MessageKey<"PullRequests">
> = {
  ready: "readinessReady",
  review_requested: "reviewRequested",
  checks_running: "readinessChecksRunning",
  checks_failing: "readinessChecksFailing",
  changes_requested: "readinessChangesRequested",
  approval_required: "readinessApprovalRequired",
  unresolved_conversations: "readinessUnresolvedConversations",
  branch_out_of_date: "readinessBranchOutOfDate",
  conflicts: "readinessConflicts",
  policy_blocked: "readinessPolicyBlocked",
  status_unavailable: "readinessUnavailable",
  draft: "readinessDraft",
  merged: "readinessMerged",
  closed: "readinessClosed",
};

const BLOCKER_KEYS: Record<
  ReadinessBlocker["kind"],
  MessageKey<"PullRequests">
> = {
  mergeability: "blockerMergeability",
  draft: "blockerDraft",
  review_requested: "blockerReviewRequested",
  checks: "blockerChecks",
  changes_requested: "blockerChangesRequested",
  approvals: "blockerApprovals",
  conversations: "blockerConversations",
  branch: "blockerBranch",
  conflicts: "blockerConflicts",
  policy: "blockerPolicy",
};

const ACTION_KEYS: Record<ReadinessAction, MessageKey<"PullRequests">> = {
  mark_ready: "blockerActionMarkReady",
  approve: "blockerActionApprove",
  resolve_conversations: "blockerActionResolve",
  update_branch: "blockerActionUpdateBranch",
  rerun_checks: "blockerActionRerun",
  enable_auto_merge: "blockerActionAutoMerge",
  open_forge: "blockerActionOpenForge",
};

const SOURCE_KEYS: Record<
  ReadinessBlocker["source"],
  MessageKey<"PullRequests">
> = {
  pull_request: "blockerSourcePullRequest",
  repository: "blockerSourceRepository",
  reviews: "blockerSourceReviews",
  conversations: "blockerSourceConversations",
  checks: "blockerSourceChecks",
};

const PASSED_KEYS: Record<
  ReadinessPassedCondition["kind"],
  MessageKey<"PullRequests">
> = {
  mergeability: "readinessConditionMergeability",
  reviewable: "readinessConditionReviewable",
  checks: "readinessConditionChecks",
  approvals: "readinessConditionApprovals",
  conversations: "readinessConditionConversations",
  branch: "readinessConditionBranch",
  policy: "readinessConditionPolicy",
};

function mergeMethodKey(method: MergeMethod): MessageKey<"PullRequests"> {
  return method === "squash"
    ? "mergeMethodSquash"
    : method === "rebase"
      ? "mergeMethodRebase"
      : "mergeMethodMerge";
}

/**
 * The color family of a readiness state. A merged pull request is done, not
 * failing: it takes the merged purple of its state badge, never the
 * destructive red of a blocker.
 */
type ReadinessTone = "ready" | "pending" | "merged" | "blocked";

function readinessTone(state: PullRequestReadinessState | null): ReadinessTone {
  if (state === null) return "pending";
  if (state === "ready") return "ready";
  if (state === "merged") return "merged";
  if (state === "review_requested" || state === "checks_running" || state === "status_unavailable") {
    return "pending";
  }
  return "blocked";
}

const TONE_TEXT: Record<ReadinessTone, string> = {
  ready: "text-emerald-700 dark:text-emerald-400",
  pending: "text-amber-700 dark:text-amber-400",
  merged: "text-violet-700 dark:text-violet-400",
  blocked: "text-destructive",
};

const TONE_BADGE: Record<ReadinessTone, string> = {
  ready: "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-600/10 text-amber-700 dark:text-amber-400",
  merged: "bg-violet-600/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
  blocked: "bg-destructive/10 text-destructive",
};

const TONE_TRIGGER: Record<ReadinessTone, string> = {
  ready:
    "!border-emerald-600/30 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 focus-visible:bg-emerald-600/15 data-[state=open]:bg-emerald-600/15 data-[state=open]:text-emerald-700 dark:!border-emerald-400/30 dark:text-emerald-400 dark:data-[state=open]:text-emerald-400",
  pending:
    "!border-amber-600/30 bg-amber-600/10 text-amber-700 hover:bg-amber-600/15 focus-visible:bg-amber-600/15 data-[state=open]:bg-amber-600/15 data-[state=open]:text-amber-700 dark:!border-amber-400/30 dark:text-amber-400 dark:data-[state=open]:text-amber-400",
  merged:
    "!border-violet-600/30 bg-violet-600/10 text-violet-700 hover:bg-violet-600/15 focus-visible:bg-violet-600/15 data-[state=open]:bg-violet-600/15 data-[state=open]:text-violet-700 dark:!border-violet-400/30 dark:text-violet-400 dark:data-[state=open]:text-violet-400",
  blocked:
    "!border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:bg-destructive/15 data-[state=open]:bg-destructive/15 data-[state=open]:text-destructive",
};

function toneIcon(tone: ReadinessTone) {
  return tone === "ready" || tone === "merged" ? CheckIcon : tone === "pending" ? Clock01Icon : AlertCircleIcon;
}

function blockerMessageKey(
  blocker: ReadinessBlocker,
): MessageKey<"PullRequests"> {
  if (blocker.id === "policy-unavailable") return "blockerPolicyUnavailable";
  if (blocker.kind === "checks" && blocker.status === "pending") {
    return "blockerChecksRunning";
  }
  return BLOCKER_KEYS[blocker.kind];
}

export function PrReadinessBadge({
  readiness,
  unavailable = false,
  className,
}: {
  readiness: PullRequestReadiness | null;
  /** The read failed: without it, a missing readiness would claim to be loading forever. */
  unavailable?: boolean;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  if (!readiness && unavailable) {
    return (
      <Badge
        variant="secondary"
        className={cn("shrink-0 gap-1.5 bg-destructive/10 text-destructive", className)}
      >
        <HugeiconsIcon icon={AlertCircleIcon} className="size-3" />
        {t("readinessUnavailable")}
      </Badge>
    );
  }
  if (!readiness) {
    return (
      <Badge
        variant="secondary"
        className={cn("shrink-0 gap-1.5 text-muted-foreground", className)}
      >
        <HugeiconsIcon icon={Clock01Icon} className="size-3" />
        {t("readinessLoading")}
      </Badge>
    );
  }
  const tone = readinessTone(readiness.state);
  return (
    <Badge
      variant="secondary"
      className={cn("shrink-0 gap-1.5", className, TONE_BADGE[tone])}
    >
      <HugeiconsIcon icon={toneIcon(tone)} className="size-3" />
      {t(STATE_KEYS[readiness.state])}
    </Badge>
  );
}

export function PrReadinessIcon({
  readiness,
  unavailable = false,
  className,
}: {
  readiness: PullRequestReadiness | null;
  unavailable?: boolean;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  const label = unavailable
    ? t("readinessUnavailable")
    : readiness
    ? t(STATE_KEYS[readiness.state])
    : t("readinessLoading");
  const tone = unavailable ? "blocked" : readinessTone(readiness?.state ?? null);
  const Icon = toneIcon(tone);
  return (
    <AppTooltip label={label}>
      <span
        aria-label={label}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center",
          TONE_TEXT[tone],
          className,
        )}
      >
        <AppIcon icon={Icon} className="size-3.5" aria-hidden />
      </span>
    </AppTooltip>
  );
}

/** Compact overflow entry with the same structure as the pull request state. */
export function PrReadinessMenuItem({ readiness, unavailable = false, disabled, onSelect }: {
  readiness: PullRequestReadiness | null;
  unavailable?: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("PullRequests");
  const failed = !readiness && unavailable;
  const tone = failed ? "blocked" : readinessTone(readiness?.state ?? null);
  return (
    <DropdownMenuItem data-testid="pr-readiness-menu" className="app-desktop:hidden"
      disabled={disabled} onSelect={onSelect} aria-haspopup="dialog">
      <AppIcon icon={toneIcon(tone)} className={TONE_TEXT[tone]} />
      {t(readiness ? STATE_KEYS[readiness.state] : failed ? "readinessUnavailable" : "readinessLoading")}
      <AppIcon icon={ArrowRight01Icon} className="ml-auto" />
    </DropdownMenuItem>
  );
}

export function PrReadinessControl({
  readiness,
  providerName,
  canAct,
  acting,
  onAction,
  canMerge,
  authorityReady = true,
  merging,
  onMerge,
  mergeFlowActive,
  autoMergeAllowed,
  autoMerging,
  onToggleAutoMerge,
  checks,
  onOpenChecks,
  open: controlledOpen,
  onOpenChange,
  position,
  triggerClassName,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  position?: { x: number; y: number };
  triggerClassName?: string;
  readiness: PullRequestReadiness;
  providerName: string;
  canAct: (blocker: ReadinessBlocker) => boolean;
  acting: ReadinessAction | null;
  onAction: (blocker: ReadinessBlocker) => void;
  canMerge: boolean;
  /** Keep controls mounted while activation authority is being checked. */
  authorityReady?: boolean;
  merging: boolean;
  onMerge: (method: MergeMethod) => void;
  /** Auto-merge (or merge queue entry) already registered at the forge. */
  mergeFlowActive: boolean;
  /** `false` = the forge refuses auto-merge; the switch then does not show. */
  autoMergeAllowed: boolean | null;
  autoMerging: boolean;
  onToggleAutoMerge: (enable: boolean) => void;
  /** The CI story, when the forge served it: the checks rows reuse the
      cards' donut instead of an anonymous clock. */
  checks?: ChecksSummary | null;
  /** Opens the checks popover of the status cards: the way to SEE the
      failing checks, which replaced the rerun gesture here. */
  onOpenChecks?: () => void;
}) {
  const t = useTranslations("PullRequests");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const preferredMethod = readiness.preferredMethod;
  const otherMethods = readiness.methods.filter(
    (method) => method !== preferredMethod,
  );
  const tone = readinessTone(readiness.state);
  const settled = readiness.state === "merged" || readiness.state === "closed";
  // The trigger says what is happening to the merge, not only what stands
  // before it: a merge in flight, then an auto-merge waiting at the forge —
  // ready or not, the forge merges it on its own. The color stays the state's.
  const autoMergeActive = mergeFlowActive && !settled;
  const triggerLabel = merging && !settled
    ? t("readinessMerging")
    : autoMergeActive
      ? t("readinessAutoMergeActive")
      : t(STATE_KEYS[readiness.state]);
  const statusIcon = merging && !settled
    ? <Spinner className="size-3.5" />
    : <HugeiconsIcon icon={toneIcon(tone)} className="size-3.5" />;
  // The switch stays while an auto-merge is registered, so it can be turned
  // off once the pull request is ready too.
  const showAutoMerge = canMerge && autoMergeAllowed !== false && (!readiness.mergeAllowed || mergeFlowActive);
  const autoMergeId = useId();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {position ? (
        <PointerAnchor position={position} />
      ) : <PopoverTrigger asChild>
        <Button
          data-testid="pr-readiness-control"
          size="sm"
          variant="outline"
          className={cn("shrink-0 gap-1.5", triggerClassName, TONE_TRIGGER[tone])}
          aria-label={triggerLabel}
          aria-busy={merging && !settled ? true : undefined}
        >
          {statusIcon}
          {triggerLabel}
          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
        </Button>
      </PopoverTrigger>}
      <PopoverContent
        data-testid="pr-readiness-popover"
        align="end"
        className="w-[min(30rem,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <ul className="flex max-h-[min(26rem,60vh)] flex-col gap-1 overflow-y-auto p-2">
          {readiness.passed.map((condition) => (
            <li
              key={condition.id}
              data-testid="pr-readiness-condition-passed"
              className="flex items-start gap-2.5 rounded-md bg-emerald-500/10 px-2.5 py-2"
            >
              <HugeiconsIcon icon={CheckIcon} className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-emerald-700 dark:text-emerald-400">
                  {t(PASSED_KEYS[condition.kind], {
                    provider: providerName,
                    count: condition.count ?? 0,
                    expected: condition.expected ?? 0,
                  })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {condition.required || condition.kind !== "checks" ? (
                    <>
                      {t(
                        condition.required
                          ? "blockerRequired"
                          : "blockerOptional",
                      )}{" "}
                      ·{" "}
                    </>
                  ) : null}
                  {t(SOURCE_KEYS[condition.source])}
                </p>
              </div>
            </li>
          ))}
          {readiness.blockers.map((blocker) => {
            const available = canAct(blocker);
            const blockerKey = blockerMessageKey(blocker);
            // The cards' grammar (MIN-548): an alpha-tinted row per state,
            // and the checks story keeps its donut — each check one slice,
            // colored by its own state — instead of an anonymous clock.
            return (
              <li
                key={blocker.id}
                className={cn(
                  "flex flex-wrap items-center gap-2 rounded-md px-2.5 py-2",
                  blocker.status === "pending"
                    ? "bg-amber-500/10"
                    : "bg-destructive/10",
                )}
              >
                {blocker.kind === "checks" && checks && checks.total > 0 ? (
                  <ChecksDonut parts={checks.checks.map((check) => check.state)} />
                ) : blocker.status === "pending" ? (
                  <HugeiconsIcon icon={Clock01Icon} className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <HugeiconsIcon icon={AlertCircleIcon} className="size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-40 flex-1">
                  <p
                    className={cn(
                      "text-sm",
                      blocker.status === "pending"
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-destructive",
                    )}
                  >
                    {t(blockerKey, {
                      provider: providerName,
                      count: blocker.count ?? 0,
                      expected: blocker.expected ?? 0,
                    })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {blocker.required || blocker.kind !== "checks" ? (
                      <>
                        {t(
                          blocker.required
                            ? "blockerRequired"
                            : "blockerOptional",
                        )}{" "}
                        ·{" "}
                      </>
                    ) : null}
                    {t(SOURCE_KEYS[blocker.source])}
                  </p>
                </div>
                {blocker.kind === "checks" && onOpenChecks ? (
                  // Seeing beats rerunning: the failing checks live in the
                  // cards' popover, one gesture away — this button opens it.
                  <Button
                    data-testid="pr-readiness-view-checks"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      onOpenChecks();
                    }}
                  >
                    {t("viewChecks")}
                  </Button>
                ) : available ? (
                  <Button
                    data-testid={`pr-readiness-action-${blocker.action}`}
                    variant="ghost"
                    size="sm"
                    disabled={!authorityReady || acting !== null}
                    onClick={() => {
                      setOpen(false);
                      onAction(blocker);
                    }}
                  >
                    {t(ACTION_KEYS[blocker.action], { provider: providerName })}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
        {/* ONE row for both gestures (MIN-548 review): the auto-merge
            switch sits right before the merge button, as "Create more" does
            in the ticket creation dialog — they are two ways to reach the
            same merge, not two stacked steps. The spinner next to its label
            carries the write in flight. */}
        <div
          className={cn(
            "flex items-center justify-end gap-4 px-3.5 py-3",
            showAutoMerge && "border-t border-border",
          )}
        >
          {showAutoMerge ? (
            <div data-testid="pr-auto-merge-toggle" className="flex min-w-0 items-center gap-3">
              <label htmlFor={autoMergeId} className="inline-flex min-w-0 items-center gap-1.5 text-sm text-foreground">
                {autoMerging ? <Spinner className="size-3 shrink-0" /> : null}
                <span className="truncate">{t("autoMergeWhenReady")}</span>
              </label>
              <Switch
                id={autoMergeId}
                checked={mergeFlowActive}
                disabled={!authorityReady || autoMerging}
                onCheckedChange={onToggleAutoMerge}
              />
            </div>
          ) : null}
          {preferredMethod ? (
            <div className="flex shrink-0 items-center">
              {/* Why the merge is (not yet) available used to sit as a
                  sentence to the left of the button; it is now a tooltip ON
                  the button — the information belongs to the gesture. The
                  span keeps the hover alive on a DISABLED button, which is
                  exactly when the explanation matters. */}
              <AppTooltip
                label={
                  readiness.mergeAllowed && canMerge && authorityReady
                    ? t("readinessMergeAvailable")
                    : t("readinessMergeUnavailable")
                }
              >
                <span className="flex items-center">
                  <Button
                    data-testid="pr-readiness-merge"
                    size="sm"
                    className={cn(otherMethods.length > 0 && "rounded-r-none")}
                    disabled={!readiness.mergeAllowed || !canMerge || !authorityReady || merging}
                    onClick={() => {
                      setOpen(false);
                      onMerge(preferredMethod);
                    }}
                  >
                    {merging ? <Spinner /> : <HugeiconsIcon icon={CheckIcon} />}
                    {t(mergeMethodKey(preferredMethod))}
                  </Button>
                  {otherMethods.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          className="rounded-l-none border-l border-primary-foreground/20 px-2"
                          disabled={!readiness.mergeAllowed || !canMerge || !authorityReady || merging}
                          aria-label={t("mergeMethodMenu")}
                          tooltip={t("mergeMethodMenu")}
                        >
                          <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {otherMethods.map((method) => (
                          <DropdownMenuItem
                            key={method}
                            onSelect={() => {
                              setOpen(false);
                              onMerge(method);
                            }}
                          >
                            {t(mergeMethodKey(method))}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </span>
              </AppTooltip>
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
