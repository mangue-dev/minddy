"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
} from "lucide-react";
import {
  Badge,
  Button,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Spinner,
  cn,
} from "mangue-ui";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { ChecksDonut } from "@/components/pull-requests/pr-readiness-cards";
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
  className,
}: {
  readiness: PullRequestReadiness | null;
  className?: string;
}) {
  const t = useTranslations("PullRequests");
  if (!readiness) {
    return (
      <Badge
        variant="secondary"
        className={cn("shrink-0 gap-1.5 text-muted-foreground", className)}
      >
        <Clock className="size-3" />
        {t("readinessLoading")}
      </Badge>
    );
  }
  const ready = readiness.state === "ready";
  const pending =
    readiness.state === "review_requested" ||
    readiness.state === "checks_running" ||
    readiness.state === "status_unavailable";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 gap-1.5",
        className,
        ready &&
          "bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
        pending &&
          "bg-amber-600/10 text-amber-700 dark:text-amber-400",
        !ready &&
          !pending &&
          "bg-destructive/10 text-destructive",
      )}
    >
      {ready ? (
        <Check className="size-3" />
      ) : pending ? (
        <Clock className="size-3" />
      ) : (
        <AlertCircle className="size-3" />
      )}
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
  const ready = readiness?.state === "ready";
  const pending =
    !unavailable &&
    (!readiness ||
      readiness.state === "review_requested" ||
      readiness.state === "checks_running" ||
      readiness.state === "status_unavailable");
  const Icon = unavailable ? AlertCircle : ready ? Check : pending ? Clock : AlertCircle;
  return (
    <AppTooltip label={label}>
      <span
        aria-label={label}
        className={cn(
          "flex size-4 shrink-0 items-center justify-center",
          unavailable && "text-destructive",
          ready && "text-emerald-700 dark:text-emerald-400",
          pending && "text-amber-700 dark:text-amber-400",
          !ready && !pending && "text-destructive",
          className,
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
    </AppTooltip>
  );
}

export function PrReadinessControl({
  readiness,
  providerName,
  canAct,
  acting,
  onAction,
  canMerge,
  merging,
  onMerge,
  mergeFlowActive,
  autoMergeAllowed,
  autoMerging,
  onToggleAutoMerge,
  checks,
  onOpenChecks,
}: {
  readiness: PullRequestReadiness;
  providerName: string;
  canAct: (blocker: ReadinessBlocker) => boolean;
  acting: ReadinessAction | null;
  onAction: (blocker: ReadinessBlocker) => void;
  canMerge: boolean;
  merging: boolean;
  onMerge: (method: MergeMethod) => void;
  /** Auto-merge (or merge queue entry) already registered at the forge. */
  mergeFlowActive: boolean;
  /** `false` = the forge refuses auto-merge; the checkbox then does not show. */
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
  const [open, setOpen] = useState(false);
  const preferredMethod = readiness.preferredMethod;
  const otherMethods = readiness.methods.filter(
    (method) => method !== preferredMethod,
  );
  const ready = readiness.state === "ready";
  const pending =
    readiness.state === "review_requested" ||
    readiness.state === "checks_running" ||
    readiness.state === "status_unavailable";
  const statusIcon = ready ? (
    <Check className="size-3.5" />
  ) : pending ? (
    <Clock className="size-3.5" />
  ) : (
    <AlertCircle className="size-3.5" />
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-testid="pr-readiness-control"
          size="sm"
          variant="outline"
          className={cn(
            "shrink-0 gap-1.5",
            ready &&
              "!border-emerald-600/30 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 focus-visible:bg-emerald-600/15 data-[state=open]:bg-emerald-600/15 data-[state=open]:text-emerald-700 dark:!border-emerald-400/30 dark:text-emerald-400 dark:data-[state=open]:text-emerald-400",
            pending &&
              "!border-amber-600/30 bg-amber-600/10 text-amber-700 hover:bg-amber-600/15 focus-visible:bg-amber-600/15 data-[state=open]:bg-amber-600/15 data-[state=open]:text-amber-700 dark:!border-amber-400/30 dark:text-amber-400 dark:data-[state=open]:text-amber-400",
            !ready &&
              !pending &&
              "!border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:bg-destructive/15 data-[state=open]:bg-destructive/15 data-[state=open]:text-destructive",
          )}
          aria-label={t(STATE_KEYS[readiness.state])}
        >
          {statusIcon}
          {t(STATE_KEYS[readiness.state])}
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
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
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
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
                  <Clock className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
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
                    disabled={acting !== null}
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
            checkbox rides the same line as the merge button — they are two
            ways to reach the same merge, not two stacked steps. Checkbox and
            title only: what the registration does is what the title says,
            and the spinner next to it carries the write in flight. */}
        <div
          className={cn(
            "flex items-center justify-between gap-3 px-3.5 py-3",
            canMerge &&
              autoMergeAllowed !== false &&
              !readiness.mergeAllowed &&
              "border-t border-border",
          )}
        >
          {canMerge && autoMergeAllowed !== false && !readiness.mergeAllowed ? (
            <label
              data-testid="pr-auto-merge-toggle"
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              <Checkbox
                checked={mergeFlowActive}
                disabled={autoMerging}
                onCheckedChange={(checked) => onToggleAutoMerge(checked === true)}
              />
              <span className="inline-flex min-w-0 items-center gap-1.5 text-sm">
                {mergeFlowActive ? t("autoMergeOn") : t("autoMergeWhenReady")}
                {autoMerging ? <Spinner className="size-3 shrink-0" /> : null}
              </span>
            </label>
          ) : null}
          {preferredMethod ? (
            // ml-auto keeps the merge pinned to the right edge of the row
            // even when the auto-merge checkbox is not shown — `justify-
            // between` alone would park a single child on the left.
            <div className="ml-auto flex shrink-0 items-center">
              {/* Why the merge is (not yet) available used to sit as a
                  sentence to the left of the button; it is now a tooltip ON
                  the button — the information belongs to the gesture. The
                  span keeps the hover alive on a DISABLED button, which is
                  exactly when the explanation matters. */}
              <AppTooltip
                label={
                  readiness.mergeAllowed && canMerge
                    ? t("readinessMergeAvailable")
                    : t("readinessMergeUnavailable")
                }
              >
                <span className="flex items-center">
                  <Button
                    data-testid="pr-readiness-merge"
                    size="sm"
                    className={cn(otherMethods.length > 0 && "rounded-r-none")}
                    disabled={!readiness.mergeAllowed || !canMerge || merging}
                    onClick={() => {
                      setOpen(false);
                      onMerge(preferredMethod);
                    }}
                  >
                    {merging ? <Spinner /> : <Check />}
                    {t(mergeMethodKey(preferredMethod))}
                  </Button>
                  {otherMethods.length > 0 ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="sm"
                          className="rounded-l-none border-l border-primary-foreground/20 px-2"
                          disabled={!readiness.mergeAllowed || !canMerge || merging}
                          aria-label={t("mergeMethodMenu")}
                        >
                          <ChevronDown className="size-3.5" />
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
