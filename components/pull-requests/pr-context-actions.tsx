"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
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

const icon = (data: Parameters<typeof HugeiconsIcon>[0]["icon"]) => (
  <HugeiconsIcon icon={data} className="size-4" />
);

/**
 * The right-click menu of a pull request row (MIN-685).
 *
 * Built for the row under the pointer, independently of the selected detail:
 * opening the menu performs that pull request's own authoritative read (the
 * same query the detail uses, so a warm cache is shared), and every forge
 * write stays hidden until the viewer is known to hold write access, then
 * disabled until that read is fresh. State changes run here, with their own
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
  const { openIntent } = useAssistantPanelActions();
  const [menuPrId, setMenuPrId] = useState<string | null>(null);
  const openedAt = useRef(0);
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

  const onItemContextMenu = useCallback((target: Element | null) => {
    const id = target?.closest<HTMLElement>("[data-pr-id]")?.dataset.prId ?? null;
    if (id) openedAt.current = Date.now();
    setMenuPrId(id);
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
      if (!pr || pr.prId !== menuPrId) return [];
      const data = detail.data;
      // Fresh = answered after this menu opened, with no pending refetch.
      const fresh =
        !!data && detail.isSuccess && detail.fetchStatus === "idle" &&
        detail.dataUpdatedAt >= openedAt.current;
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
        const threads = reviews.data
          ? unresolvedReviewThreads(reviews.data.comments, reviews.data.threads)
          : [];
        const ready = fresh && reviews.isSuccess;
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
    [acting, detail.data, detail.dataUpdatedAt, detail.fetchStatus, detail.isSuccess, menuPrId, onMerge, openIntent, pullRequests, reviews.data, reviews.isSuccess, t],
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
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
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
