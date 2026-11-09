"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Cancel01Icon,
  Copy01Icon,
  Edit04Icon,
  GitMergeIcon,
  RepeatIcon,
  TaskDone01Icon,
} from "@hugeicons/core-free-icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import type { ContextMenuAction } from "@/components/issue-context-menu";
import { NumoIcon } from "@/components/numo-icon";
import {
  actOnPullRequestApi,
  prEndpoint,
  type AgentRunPrResponse,
  type PullRequestListItem,
} from "@/lib/agent-api";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { prReviewCommentsQueryOptions } from "@/lib/pr-activity-query";
import { buildPullRequestFixPrompt, buildPullRequestNumoFixPrompt } from "@/lib/pr-fix-prompt";
import {
  prStateTransitionActions,
  type EditablePrState,
  type PrStateAction,
} from "@/lib/pr-state-transition";
import { unresolvedReviewThreads } from "@/lib/pr-unresolved-conversations";
import { pullRequestQueryOptions } from "@/lib/pull-request-query";
import { prMenuCanMerge, prMenuNeedsFix, prMenuStateTargets } from "@/lib/pr-context-menu";

type PrState = PullRequestListItem["pr_state"];

type ReviewComments = NonNullable<Awaited<ReturnType<ReturnType<typeof prReviewCommentsQueryOptions>["queryFn"]>>>;

/** What one opening of the menu read, once both reads had answered. */
type SettledMenuRead = {
  prId: string;
  openedAt: number;
  detail: AgentRunPrResponse | undefined;
  /** The detail read of this opening succeeded. */
  fresh: boolean;
  /** Undefined when the review threads could not be read. */
  reviews: ReviewComments | undefined;
};

const icon = (data: Parameters<typeof HugeiconsIcon>[0]["icon"]) => (
  <HugeiconsIcon icon={data} className="size-4" />
);

/**
 * The right-click menu of a pull request row (MIN-685).
 *
 * Built for the row under the pointer, independently of the selected detail:
 * opening the menu performs that pull request's own authoritative read (the
 * same query the detail uses, so a warm cache is shared). Until that read and
 * the review threads have answered, the menu holds a single "Loading…" entry;
 * once they have, the entries are built from that answer and kept for as long
 * as the menu stays open. Background refetches (the detail polls) never
 * reshape or re-disable an open menu: building from live query state made the
 * entries appear, vanish and toggle while the reads settled. Forge writes are
 * hidden from a viewer known to lack write access, and disabled when the read
 * failed. State changes run here, with their own
 * confirmation and the page's optimistic reconciliation; merge hands over to
 * the detail's merge dialog (commit message, method, Numo merge), which the
 * server gates once more on confirmation.
 */
export function usePrContextActions({
  pullRequests,
  onOptimisticStateChange,
  onStateChange,
  onRefetchList,
  onMerge,
}: {
  pullRequests: readonly PullRequestListItem[];
  onOptimisticStateChange: (prId: string, state: PrState) => () => void;
  onStateChange: (prId: string, state: PrState) => void;
  onRefetchList: () => void;
  /** Open the detail of `prId` on its merge confirmation. */
  onMerge: (prId: string) => void;
}): {
  itemContextActions: (target: Element) => ContextMenuAction[];
  onItemContextMenu: (target: Element | null) => void;
  dialog: ReactNode;
} {
  const t = useTranslations("PullRequests");
  const tCommon = useTranslations("Common");
  const { openIntent } = useAssistantPanelActions();
  // The row whose menu is open, and when it opened: only reads answered
  // after that moment count as this opening's own.
  const [menu, setMenu] = useState<{ prId: string; openedAt: number } | null>(null);
  const menuPrId = menu?.prId ?? null;
  const [confirm, setConfirm] = useState<{ pr: PullRequestListItem; draft: boolean; state: EditablePrState } | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  // The menu's own reads: enabled while the menu is open, even inside a
  // browsed (inactive) sidebar level where the detail's hook stays idle.
  const detail = useQuery({
    ...pullRequestQueryOptions(menuPrId ?? ""),
    enabled: !!menuPrId,
  });
  const reviews = useQuery({
    ...prReviewCommentsQueryOptions(menuPrId ? prEndpoint(menuPrId) : null),
    enabled: !!menuPrId,
  });

  // Every opening reads again, including a second right-click on the same
  // row, whose unchanged query key would not start a read by itself. A read
  // already in flight is joined rather than restarted.
  const openedAt = menu?.openedAt;
  const refetchDetail = detail.refetch;
  const refetchReviews = reviews.refetch;
  useEffect(() => {
    if (openedAt === undefined) return;
    void refetchDetail({ cancelRefetch: false });
    void refetchReviews({ cancelRefetch: false });
  }, [openedAt, refetchDetail, refetchReviews]);

  // The answer this opening's entries are built from, latched once both reads
  // settle: later refetches leave an open menu as it is.
  const [settled, setSettled] = useState<SettledMenuRead | null>(null);
  const detailSettled = !!menu && detail.fetchStatus === "idle" && (
    (detail.isSuccess && detail.dataUpdatedAt >= menu.openedAt) ||
    (detail.isError && detail.errorUpdatedAt >= menu.openedAt)
  );
  const reviewsSettled = !!menu && reviews.fetchStatus === "idle" && (
    (reviews.isSuccess && reviews.dataUpdatedAt >= menu.openedAt) ||
    (reviews.isError && reviews.errorUpdatedAt >= menu.openedAt)
  );
  if (menu && detailSettled && reviewsSettled &&
      (settled?.prId !== menu.prId || settled.openedAt !== menu.openedAt)) {
    // Adjusting state while rendering: React re-renders right away, before
    // the menu paints with the previous value.
    setSettled({
      prId: menu.prId,
      openedAt: menu.openedAt,
      detail: detail.data,
      fresh: detail.isSuccess,
      reviews: reviews.isSuccess ? reviews.data : undefined,
    });
  }

  const onItemContextMenu = useCallback((target: Element | null) => {
    const id = target?.closest<HTMLElement>("[data-pr-id]")?.dataset.prId ?? null;
    setMenu(id ? { prId: id, openedAt: Date.now() } : null);
    setSettled(null);
  }, []);

  const runStateChange = useCallback(
    async (pr: PullRequestListItem, draft: boolean, target: EditablePrState) => {
      const current: EditablePrState = pr.pr_state === "closed" ? "closed" : draft ? "draft" : "open";
      const [first, ...following] = prStateTransitionActions(current, target, draft);
      if (!first || acting) return;
      const finalAction: PrStateAction = following.at(-1) ?? first;
      setActing(pr.prId);
      const rollback = onOptimisticStateChange(pr.prId, target === "closed" ? "closed" : target);
      try {
        let result = await actOnPullRequestApi(pr.prId, first);
        for (const next of following) result = await actOnPullRequestApi(pr.prId, next);
        onStateChange(pr.prId, result.pr_state);
        toast.success(
          finalAction === "close"
            ? t("closedToast")
            : finalAction === "reopen"
              ? t("reopenedToast")
              : finalAction === "convert_to_draft"
                ? t("convertedToDraftToast")
                : t("readyForReviewToast"),
        );
      } catch (err) {
        rollback();
        toast.error((err as Error).message);
      } finally {
        onRefetchList();
        setActing(null);
      }
    },
    [acting, onOptimisticStateChange, onRefetchList, onStateChange, t],
  );

  const itemContextActions = useCallback(
    (target: Element): ContextMenuAction[] => {
      const id = target.closest<HTMLElement>("[data-pr-id]")?.dataset.prId;
      const pr = id ? pullRequests.find((item) => item.prId === id) : undefined;
      if (!pr || !menu || pr.prId !== menu.prId) return [];
      // A merged pull request has nothing to offer, whatever the reads say.
      if (pr.pr_state === "merged") return [];
      const read = settled && settled.prId === menu.prId && settled.openedAt === menu.openedAt ? settled : null;
      // One stable entry while the reads settle, rather than entries that
      // show, hide and toggle as each answer lands.
      if (!read) return [{ id: "pr-loading", label: tCommon("loading"), disabled: true }];
      const data = read.detail;
      // Fresh = this opening's read succeeded.
      const fresh = read.fresh && !!data;
      const capability = data?.viewer?.capability;
      // A loaded read that denies write access hides the forge writes.
      const writable = capability === undefined || capability === "write";
      const writeDisabled = !fresh || capability !== "write" || acting !== null;
      const draft = data?.pr?.draft ?? pr.pr_state === "draft";
      const state: PrState = pr.pr_state === "open" && draft ? "draft" : pr.pr_state;
      const actions: ContextMenuAction[] = [];

      if (writable) {
        if (prMenuCanMerge(state, draft, fresh ? data?.readiness : null)) {
          actions.push({
            id: "pr-merge",
            label: t("merge"),
            icon: icon(GitMergeIcon),
            disabled: writeDisabled,
            transfersFocus: true,
            onSelect: () => onMerge(pr.prId),
          });
        }
        for (const next of prMenuStateTargets(state)) {
          actions.push({
            id: `pr-state-${next}`,
            label:
              next === "closed"
                ? t("closePullRequest")
                : next === "draft"
                  ? t("convertToDraft")
                  : state === "closed"
                    ? t("reopen")
                    : t("readyForReview"),
            icon: icon(next === "closed" ? Cancel01Icon : next === "draft" ? Edit04Icon : state === "closed" ? RepeatIcon : TaskDone01Icon),
            disabled: writeDisabled,
            transfersFocus: true,
            onSelect: () => setConfirm({ pr, draft, state: next }),
          });
        }
      }

      // Fixing concerns only a pull request that is still alive.
      if (state === "open" || state === "draft") {
        const threads = read.reviews
          ? unresolvedReviewThreads(read.reviews.comments, read.reviews.threads)
          : [];
        const ready = fresh && !!read.reviews;
        if (!ready || prMenuNeedsFix(data, threads.length)) {
          const context = {
            number: pr.pr_number,
            title: data?.pr?.title ?? pr.title ?? pr.issue?.title ?? `#${pr.pr_number}`,
            url: data?.pr?.url ?? pr.pr_url,
            base: data?.pr?.base ?? null,
            head: data?.pr?.head ?? pr.head_branch,
          };
          const fixExtras = {
            unresolvedThreads: threads,
            branchOutOfDate: !!data?.readiness?.blockers.some((blocker) => blocker.kind === "branch"),
          };
          // The copied prompt asks a coding agent for the fix; Numo gets its
          // own prompt, since it never writes code (MIN-721).
          const prompt = ready
            ? buildPullRequestFixPrompt(context, data?.checks ?? null, fixExtras)
            : "";
          const numoPrompt = ready
            ? buildPullRequestNumoFixPrompt(context, data?.checks ?? null, fixExtras)
            : "";
          actions.push({
            id: "pr-fix-copy",
            label: t("copyFixPrompt"),
            icon: icon(Copy01Icon),
            separatorBefore: actions.length > 0,
            disabled: !ready,
            onSelect: () => {
              void navigator.clipboard.writeText(prompt).then(
                () => toast.success(t("unresolvedPromptCopied")),
                () => toast.error(t("unresolvedPromptCopyFailed")),
              );
            },
          });
          const projectId = pr.project?.id ?? null;
          const head = data?.pr?.head ?? pr.head_branch;
          actions.push({
            id: "pr-fix-numo",
            label: t("fixWithNumo"),
            icon: <NumoIcon className="size-4" />,
            disabled: !ready || !projectId || !head,
            transfersFocus: true,
            onSelect: () =>
              openIntent({
                source: "pull_request",
                action: "fix",
                projectId,
                prompt: numoPrompt,
                pageContext: {
                  projectId: projectId ?? undefined,
                  pullRequestId: pr.prId,
                  prNumber: pr.pr_number,
                  prState: state,
                  prHeadRef: head ?? undefined,
                  prBaseRef: data?.pr?.base ?? undefined,
                },
              }),
          });
        }
      }
      return actions;
    },
    [acting, menu, onMerge, openIntent, pullRequests, settled, t, tCommon],
  );

  const dialog = useMemo(() => {
    // Mounted only while a change awaits confirmation.
    const target = confirm;
    if (!target) return null;
    const current: EditablePrState = target.pr.pr_state === "closed" ? "closed" : target.draft ? "draft" : "open";
    const stateLabel = (state: EditablePrState) =>
      t(state === "draft" ? "stateDraft" : state === "closed" ? "stateClosed" : "stateOpen");
    return (
      <AlertDialog open onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("confirmStateChangeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("confirmStateChangeDescription", {
                currentState: stateLabel(current),
                nextState: stateLabel(target.state),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant={target.state === "closed" ? "destructive" : "default"}
              onClick={() => {
                void runStateChange(target.pr, target.draft, target.state);
                setConfirm(null);
              }}
            >
              {t("confirmStateChange")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [confirm, runStateChange, t]);

  return { itemContextActions, onItemContextMenu, dialog };
}
