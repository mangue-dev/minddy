"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  SidePanel,
  SidePanelBody,
  SidePanelContent,
  SidePanelDescription,
  SidePanelHeader,
  SidePanelTitle,
  Spinner,
  toast,
} from "mangue-ui";
import { CheckCheck, ChevronDown, Copy, ListFilter } from "lucide-react";

import { ForgeUserAvatar } from "@/components/git/forge-user-avatar";
import { NumoIcon } from "@/components/numo-icon";
import {
  PrActivityItem,
  PrActivityTimeline,
} from "@/components/pull-requests/pr-activity-timeline";
import {
  useReviewReplies,
  useThreadResolution,
} from "@/components/pull-requests/pr-review-comments";
import { ReviewConversationCard } from "@/components/pull-requests/pr-timeline";
import type { PrEndpoint } from "@/lib/agent-api";
import {
  buildPullRequestFeedbackPrompt,
  type PullRequestFeedbackContext,
  type PullRequestFeedbackThread,
} from "@/lib/pr-unresolved-conversations";

export function PrUnresolvedConversations({
  endpoint,
  context,
  threads,
  canComment,
  canResolve,
  canLaunch,
  open,
  onOpenChange,
  onLaunch,
  onThreadChanged,
  onResolutionChanged,
}: {
  endpoint: PrEndpoint;
  context: PullRequestFeedbackContext;
  threads: PullRequestFeedbackThread[];
  canComment: boolean;
  canResolve: boolean;
  canLaunch: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunch: (prompt: string) => void;
  onThreadChanged: () => unknown;
  onResolutionChanged: () => unknown;
}) {
  const t = useTranslations("PullRequests");
  const [confirmOutdated, setConfirmOutdated] = useState(false);
  const [resolvingOutdated, setResolvingOutdated] = useState(false);
  const replies = useReviewReplies(endpoint, onThreadChanged);
  const resolution = useThreadResolution(endpoint, onResolutionChanged);
  const outdated = useMemo(
    () => threads.filter((thread) => thread.resolution?.outdated),
    [threads],
  );

  const copyPrompt = useCallback(
    async (selected: PullRequestFeedbackThread[]) => {
      try {
        await navigator.clipboard.writeText(
          buildPullRequestFeedbackPrompt(context, selected),
        );
        toast.success(t("unresolvedPromptCopied"));
      } catch {
        toast.error(t("unresolvedPromptCopyFailed"));
      }
    },
    [context, t],
  );

  const resolveOutdated = useCallback(async () => {
    if (resolvingOutdated) return;
    setResolvingOutdated(true);
    const results = await Promise.all(
      outdated.map((thread) => resolution.setResolved(thread, true, false)),
    );
    const resolved = results.filter(Boolean).length;
    setConfirmOutdated(false);
    setResolvingOutdated(false);
    if (resolved > 0) {
      if (resolved === threads.length) onOpenChange(false);
      toast.success(t("outdatedResolvedToast", { count: resolved }));
      await onResolutionChanged();
    }
  }, [
    onOpenChange,
    onResolutionChanged,
    outdated,
    resolution,
    resolvingOutdated,
    t,
    threads.length,
  ]);

  if (threads.length === 0) return null;

  return (
    <>
      <div
        data-testid="pr-unresolved-workspace"
        className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card px-3.5 py-2"
      >
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ListFilter className="size-3" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium">
          {t("unresolvedWorkspaceTitle", { count: threads.length })}
        </span>
        <Button
          data-testid="pr-unresolved-list-trigger"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => onOpenChange(true)}
        >
          {t("unresolvedViewList", { count: threads.length })}
        </Button>
      </div>

      <SidePanel open={open} onOpenChange={onOpenChange}>
        <SidePanelContent
          side="right"
          className="w-[min(760px,calc(100vw-2rem))]"
        >
          <SidePanelHeader className="px-4 py-4">
            <SidePanelTitle>{t("unresolvedListTitle")}</SidePanelTitle>
            <SidePanelDescription>{t("unresolvedListHint")}</SidePanelDescription>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              {canResolve && outdated.length > 0 ? (
                <Button
                  data-testid="pr-resolve-outdated"
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmOutdated(true)}
                >
                  <CheckCheck />
                  {t("resolveOutdated", { count: outdated.length })}
                </Button>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    data-testid="pr-fix-all"
                    variant="outline"
                    size="sm"
                  >
                    {t("fixAllConversations")}
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onSelect={() => void copyPrompt(threads)}>
                    <Copy />
                    {t("copyUnresolvedPrompt")}
                  </DropdownMenuItem>
                  {canLaunch ? (
                    <DropdownMenuItem
                      onSelect={() => {
                        onOpenChange(false);
                        onLaunch(buildPullRequestFeedbackPrompt(context, threads));
                      }}
                    >
                      <NumoIcon animated={false} />
                      {t("launchNumoUnresolved")}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SidePanelHeader>

          <SidePanelBody className="min-h-0 bg-background px-4 py-4">
            <PrActivityTimeline>
              {threads.map((thread) => (
                <PrActivityItem
                  key={thread.id}
                  marker={
                    <ForgeUserAvatar
                      user={thread.root.user}
                      className="size-8 ring-2 ring-background"
                    />
                  }
                >
                  <div data-testid="pr-unresolved-conversation">
                    <ReviewConversationCard
                      thread={thread}
                      replies={replies}
                      resolution={canResolve ? resolution : undefined}
                      readOnly={!canComment}
                    />
                  </div>
                </PrActivityItem>
              ))}
            </PrActivityTimeline>
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
              {t("resolveOutdatedDialogDescription", { count: outdated.length })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={resolvingOutdated}
              onClick={() => setConfirmOutdated(false)}
            >
              {t("cancel")}
            </Button>
            <Button
              data-testid="pr-resolve-outdated-confirm"
              disabled={resolvingOutdated}
              onClick={() => void resolveOutdated()}
            >
              {resolvingOutdated ? <Spinner /> : <CheckCheck />}
              {t("resolveOutdatedConfirm", { count: outdated.length })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
