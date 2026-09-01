"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
} from "lucide-react";
import {
  Badge,
  Button,
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
  checks_running: "readinessChecksRunning",
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
}: {
  readiness: PullRequestReadiness | null;
}) {
  const t = useTranslations("PullRequests");
  if (!readiness) {
    return (
      <Badge
        variant="secondary"
        className="shrink-0 gap-1.5 text-muted-foreground"
      >
        <Clock className="size-3" />
        {t("readinessLoading")}
      </Badge>
    );
  }
  const ready = readiness.state === "ready";
  const pending =
    readiness.state === "checks_running" ||
    readiness.state === "status_unavailable";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 gap-1.5",
        ready &&
          "border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
        pending &&
          "border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-400",
        !ready &&
          !pending &&
          "border-destructive/20 bg-destructive/10 text-destructive",
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

export function PrReadinessControl({
  readiness,
  providerName,
  fallbackUrl,
  canAct,
  acting,
  onAction,
  canMerge,
  merging,
  onMerge,
}: {
  readiness: PullRequestReadiness;
  providerName: string;
  fallbackUrl: (blocker: ReadinessBlocker) => string | null;
  canAct: (blocker: ReadinessBlocker) => boolean;
  acting: ReadinessAction | null;
  onAction: (blocker: ReadinessBlocker) => void;
  canMerge: boolean;
  merging: boolean;
  onMerge: (method: MergeMethod) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);
  const preferredMethod = readiness.preferredMethod;
  const otherMethods = readiness.methods.filter(
    (method) => method !== preferredMethod,
  );
  const ready = readiness.state === "ready";
  const pending =
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
              "border-emerald-600/30 bg-emerald-600/10 text-emerald-700 hover:bg-emerald-600/15 focus-visible:bg-emerald-600/15 data-[state=open]:bg-emerald-600/15 data-[state=open]:text-emerald-700 dark:text-emerald-400 dark:data-[state=open]:text-emerald-400",
            pending &&
              "border-amber-600/30 bg-amber-600/10 text-amber-700 hover:bg-amber-600/15 focus-visible:bg-amber-600/15 data-[state=open]:bg-amber-600/15 data-[state=open]:text-amber-700 dark:text-amber-400 dark:data-[state=open]:text-amber-400",
            !ready &&
              !pending &&
              "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 focus-visible:bg-destructive/15 data-[state=open]:bg-destructive/15 data-[state=open]:text-destructive",
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
        <div className="border-b border-border px-3.5 py-3">
          <p className="text-sm font-medium">{t("readinessChecklist")}</p>
          <p className="text-xs text-muted-foreground">
            {t("readinessChecklistHint")}
          </p>
        </div>
        <ul className="max-h-[min(26rem,60vh)] divide-y divide-border overflow-y-auto">
          {readiness.passed.map((condition) => (
            <li
              key={condition.id}
              data-testid="pr-readiness-condition-passed"
              className="flex items-start gap-2.5 px-3.5 py-2.5"
            >
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm">
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
            const providerUrl = fallbackUrl(blocker);
            const blockerKey = blockerMessageKey(blocker);
            return (
              <li
                key={blocker.id}
                className="flex flex-wrap items-center gap-2 px-3.5 py-2.5"
              >
                {blocker.status === "pending" ? (
                  <Clock className="size-4 shrink-0 text-amber-500" />
                ) : (
                  <AlertCircle className="size-4 shrink-0 text-destructive" />
                )}
                <div className="min-w-40 flex-1">
                  <p className="text-sm">
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
                {available ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={acting !== null}
                    onClick={() => {
                      setOpen(false);
                      onAction(blocker);
                    }}
                  >
                    {t(ACTION_KEYS[blocker.action], { provider: providerName })}
                  </Button>
                ) : providerUrl ? (
                  <Button variant="outline" size="sm" asChild>
                    <a href={providerUrl} target="_blank" rel="noreferrer">
                      {t(ACTION_KEYS[blocker.action], {
                        provider: providerName,
                      })}
                      <ExternalLink className="size-3.5" />
                    </a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    {t("blockerActionUnavailable")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3.5 py-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            {readiness.mergeAllowed && canMerge
              ? t("readinessMergeAvailable")
              : t("readinessMergeUnavailable")}
          </p>
          {preferredMethod ? (
            <div className="flex shrink-0 items-center">
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
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
