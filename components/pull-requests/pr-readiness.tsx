"use client";

import { useTranslations } from "next-intl";
import { AlertCircle, Check, Clock, ExternalLink } from "lucide-react";
import { Badge, Button, cn } from "mangue-ui";

import type {
  PullRequestReadiness,
  ReadinessAction,
  ReadinessBlocker,
  PullRequestReadinessState,
} from "@/lib/pr-readiness";
import type { MessageKey } from "@/lib/i18n-keys";

const STATE_KEYS: Record<PullRequestReadinessState, MessageKey<"PullRequests">> = {
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

const BLOCKER_KEYS: Record<ReadinessBlocker["kind"], MessageKey<"PullRequests">> = {
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

const SOURCE_KEYS: Record<ReadinessBlocker["source"], MessageKey<"PullRequests">> = {
  pull_request: "blockerSourcePullRequest",
  repository: "blockerSourceRepository",
  reviews: "blockerSourceReviews",
  conversations: "blockerSourceConversations",
  checks: "blockerSourceChecks",
};

export function PrReadinessBadge({ readiness }: { readiness: PullRequestReadiness | null }) {
  const t = useTranslations("PullRequests");
  if (!readiness) {
    return (
      <Badge variant="secondary" className="shrink-0 gap-1.5 text-muted-foreground">
        <Clock className="size-3" />
        {t("readinessLoading")}
      </Badge>
    );
  }
  const ready = readiness.state === "ready";
  const pending = readiness.state === "checks_running" || readiness.state === "status_unavailable";
  return (
    <Badge
      variant="secondary"
      className={cn(
        "shrink-0 gap-1.5",
        ready && "border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400",
        pending && "border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-400",
        !ready && !pending && "border-destructive/20 bg-destructive/10 text-destructive",
      )}
    >
      {ready ? <Check className="size-3" /> : pending ? <Clock className="size-3" /> : <AlertCircle className="size-3" />}
      {t(STATE_KEYS[readiness.state])}
    </Badge>
  );
}

export function PrReadinessPanel({
  readiness,
  fallbackUrl,
  canAct,
  acting,
  onAction,
}: {
  readiness: PullRequestReadiness;
  fallbackUrl: (blocker: ReadinessBlocker) => string | null;
  canAct: (blocker: ReadinessBlocker) => boolean;
  acting: ReadinessAction | null;
  onAction: (blocker: ReadinessBlocker) => void;
}) {
  const t = useTranslations("PullRequests");
  if (readiness.blockers.length === 0) return null;
  return (
    <section className="rounded-lg border border-border bg-card" aria-label={t("readinessChecklist")}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-2.5">
        <div>
          <p className="text-sm font-medium">{t("readinessChecklist")}</p>
          <p className="text-xs text-muted-foreground">{t("readinessChecklistHint")}</p>
        </div>
        <PrReadinessBadge readiness={readiness} />
      </div>
      <ul className="divide-y divide-border">
        {readiness.blockers.map((blocker) => {
          const available = canAct(blocker);
          const forgeUrl = fallbackUrl(blocker);
          return (
            <li key={blocker.id} className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
              {blocker.status === "pending" ? (
                <Clock className="size-4 shrink-0 text-amber-500" />
              ) : (
                <AlertCircle className="size-4 shrink-0 text-destructive" />
              )}
              <div className="min-w-40 flex-1">
                <p className="text-sm">{t(BLOCKER_KEYS[blocker.kind], {
                  count: blocker.count ?? 0,
                  expected: blocker.expected ?? 0,
                })}</p>
                <p className="text-xs text-muted-foreground">
                  {t(blocker.required ? "blockerRequired" : "blockerOptional")} · {t(SOURCE_KEYS[blocker.source])}
                </p>
              </div>
              {available ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={acting !== null}
                  onClick={() => onAction(blocker)}
                >
                  {t(ACTION_KEYS[blocker.action])}
                </Button>
              ) : forgeUrl ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={forgeUrl} target="_blank" rel="noreferrer">
                    {t(ACTION_KEYS[blocker.action])}
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">{t("blockerActionUnavailable")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
