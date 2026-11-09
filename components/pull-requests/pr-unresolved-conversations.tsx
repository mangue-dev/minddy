"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  FilterIcon,
  CheckIcon,
} from "@hugeicons/core-free-icons";
import { useCallback, useMemo, useRef, useState } from "react";
import { usePromptAnnouncement, usePromptDelivery } from "@/lib/prompt-delivery-context";
import { PromptActionIcon, usePromptActionLabel } from "@/components/prompt-action";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { SidePanel, SidePanelBody, SidePanelContent, SidePanelDescription, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { GitLogin } from "@/components/git/git-login";
import {
  useReviewReplies,
  useThreadResolution,
} from "@/components/pull-requests/pr-review-comments";
import { ReviewConversationStack } from "@/components/pull-requests/pr-timeline";
import type { PrEndpoint } from "@/lib/agent-api";
import {
  buildPullRequestFeedbackPrompt,
  conversationReviewerGroups,
  type PullRequestFeedbackContext,
  type PullRequestFeedbackThread,
} from "@/lib/pr-unresolved-conversations";

export function PrUnresolvedConversations({
  endpoint,
  context,
  threads,
  canComment,
  canResolve,
  open,
  onOpenChange,
  onThreadChanged,
  onResolutionChanged,
  showBar = true,
}: {
  endpoint: PrEndpoint;
  context: PullRequestFeedbackContext;
  threads: PullRequestFeedbackThread[];
  canComment: boolean;
  canResolve: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onThreadChanged: () => unknown;
  onResolutionChanged: () => unknown;
  /** Inline workspace bar — hidden when the status cards carry the count. */
  showBar?: boolean;
}) {
  const t = useTranslations("PullRequests");
  const promptDelivery = usePromptDelivery();
  const announcePrompt = usePromptAnnouncement();
  const promptLabel = usePromptActionLabel();
  const tCommon = useTranslations("Common");
  const [confirmOutdated, setConfirmOutdated] = useState(false);
  const [confirmResolveAll, setConfirmResolveAll] = useState(false);
  // One bulk resolution at a time: both act on the same threads, so while
  // either runs, neither can start. The ref answers before React commits.
  const [bulk, setBulk] = useState<null | "outdated" | "all">(null);
  const bulkRef = useRef<null | "outdated" | "all">(null);
  const resolvingOutdated = bulk === "outdated";
  const resolvingAll = bulk === "all";
  const replies = useReviewReplies(endpoint, onThreadChanged);
  const resolution = useThreadResolution(endpoint, onResolutionChanged);
  const unresolved = useMemo(
    () => threads.filter((thread) => thread.resolution?.resolved === false),
    [threads],
  );
  const groups = useMemo(() => conversationReviewerGroups(threads), [threads]);
  const outdated = useMemo(
    () => unresolved.filter((thread) => thread.resolution?.outdated),
    [unresolved],
  );

  const copyPrompt = useCallback(
    async (selected: PullRequestFeedbackThread[]) => {
      try {
        const outcome = await promptDelivery.deliver(
          buildPullRequestFeedbackPrompt(context, selected),
        );
        announcePrompt(outcome, t("unresolvedPromptCopied"));
      } catch {
        toast.error(t("unresolvedPromptCopyFailed"));
      }
    },
    [context, promptDelivery, announcePrompt, t],
  );

  /** Resolves `threads` as one bulk run; the count resolved, or `null` when
      another bulk run already holds the threads. */
  const runBulk = useCallback(
    async (kind: "outdated" | "all", threads: PullRequestFeedbackThread[]) => {
      if (bulkRef.current) return null;
      bulkRef.current = kind;
      setBulk(kind);
      try {
        const results = await Promise.all(
          threads.map((thread) => resolution.setResolved(thread, true, false)),
        );
        return results.filter(Boolean).length;
      } finally {
        bulkRef.current = null;
        setBulk(null);
      }
    },
    [resolution],
  );

  const resolveOutdated = useCallback(async () => {
    const resolved = await runBulk("outdated", outdated);
    if (resolved === null) return;
    setConfirmOutdated(false);
    if (resolved > 0) {
      toast.success(t("outdatedResolvedToast", { count: resolved }));
      await onResolutionChanged();
    }
  }, [onResolutionChanged, outdated, runBulk, t]);

  // Resolve EVERY open conversation at once — the gesture of a review
  // someone chose to settle by hand rather than fix in code. It asks for
  // confirmation first: resolving silences the threads without touching
  // the code, and doing it by accident would hide real feedback.
  const resolveAll = useCallback(async () => {
    const resolved = await runBulk("all", unresolved);
    if (resolved === null) return;
    setConfirmResolveAll(false);
    if (resolved > 0) {
      toast.success(t("allResolvedToast", { count: resolved }));
      await onResolutionChanged();
    }
  }, [onResolutionChanged, runBulk, t, unresolved]);

  return (
    <>
      {showBar ? (
        <div
          data-testid="pr-unresolved-workspace"
          className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2"
        >
          <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <HugeiconsIcon icon={FilterIcon} className="size-3" />
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium">
            {t("cardConversations", { count: threads.length })}
          </span>
          <Button
            data-testid="pr-unresolved-list-trigger"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => onOpenChange(true)}
          >
            {t("viewConversations")}
          </Button>
        </div>
      ) : null}

      <SidePanel open={open} onOpenChange={onOpenChange}>
        <SidePanelContent
          side="right"
          autoFocusOnOpen
          className="w-[min(760px,calc(100vw-2rem))]"
        >
          <SidePanelHeader className="px-4 py-4">
            <SidePanelTitle>{t("conversationsTitle")}</SidePanelTitle>
            <SidePanelDescription>
              {t("conversationsHint")}
            </SidePanelDescription>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {canResolve && outdated.length > 0 ? (
                <Button
                  data-testid="pr-resolve-outdated"
                  variant="outline"
                  size="sm"
                  disabled={bulk !== null}
                  onClick={() => setConfirmOutdated(true)}
                >
                  <HugeiconsIcon icon={CheckIcon} />
                  {t("resolveOutdated", { count: outdated.length })}
                </Button>
              ) : null}
              {unresolved.length > 0 ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      data-testid="pr-fix-all"
                      variant="outline"
                      size="sm"
                    >
                      {t("fixAllConversations")}
                      <HugeiconsIcon
                        icon={ArrowDown01Icon}
                        className="size-3.5"
                      />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem
                      onSelect={() => void copyPrompt(unresolved)}
                    >
                      <PromptActionIcon />
                      {promptLabel(t("copyUnresolvedPrompt"))}
                    </DropdownMenuItem>
                    {canResolve ? (
                      <DropdownMenuItem
                        data-testid="pr-fix-all-resolve"
                        disabled={bulk !== null}
                        onSelect={() => setConfirmResolveAll(true)}
                      >
                        <HugeiconsIcon icon={CheckIcon} />
                        {t("resolveAll")}
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          </SidePanelHeader>

          <SidePanelBody className="min-h-0 bg-background px-4 py-4">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("noConversations")}
              </p>
            ) : null}
            <div
              data-testid="pr-conversations-groups"
              className="flex flex-col gap-5"
            >
              {groups.map((group, index) => (
                <section
                  key={group.key}
                  data-resolved={group.resolved ?? "unknown"}
                >
                  {index === 0 ||
                  groups[index - 1].resolved !== group.resolved ? (
                    <h3 className="mb-3 text-xs font-medium text-muted-foreground">
                      {t(
                        group.resolved === undefined
                          ? "unknownConversations"
                          : group.resolved
                            ? "resolvedConversations"
                            : "openConversations",
                      )}
                    </h3>
                  ) : null}
                  <header className="mb-3 flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2">
                    <ForgeUserAvatar user={group.reviewer} className="size-5" />
                    {group.reviewer ? (
                      <GitLogin
                        login={group.reviewer.login}
                        className="text-sm font-medium"
                      />
                    ) : (
                      <span className="text-sm">{t("unknownReviewer")}</span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {group.threads.length}
                    </span>
                  </header>
                  <ReviewConversationStack
                    listTestId="pr-unresolved-conversations-list"
                    itemTestId="pr-unresolved-conversation"
                    threads={group.threads}
                    replies={replies}
                    resolution={canResolve ? resolution : undefined}
                    readOnly={!canComment}
                  />
                </section>
              ))}
            </div>
          </SidePanelBody>
        </SidePanelContent>
      </SidePanel>

      <Dialog
        open={confirmOutdated}
        onOpenChange={(next) => !resolvingOutdated && setConfirmOutdated(next)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resolveOutdatedDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("resolveOutdatedDialogDescription", {
                count: outdated.length,
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={resolvingOutdated}
              onClick={() => setConfirmOutdated(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              data-testid="pr-resolve-outdated-confirm"
              disabled={bulk !== null}
              onClick={() => void resolveOutdated()}
            >
              {resolvingOutdated ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={CheckIcon} />
              )}
              {t("resolveOutdatedConfirm", { count: outdated.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmResolveAll}
        onOpenChange={(next) => !resolvingAll && setConfirmResolveAll(next)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("resolveAllDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("resolveAllDialogDescription", { count: unresolved.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={resolvingAll}
              onClick={() => setConfirmResolveAll(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              data-testid="pr-resolve-all-confirm"
              disabled={bulk !== null}
              onClick={() => void resolveAll()}
            >
              {resolvingAll ? <Spinner /> : <HugeiconsIcon icon={CheckIcon} />}
              {t("resolveAllConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
