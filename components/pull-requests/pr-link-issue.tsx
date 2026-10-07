"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Link02Icon } from "@hugeicons/core-free-icons";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Spinner,
  toast,
  cn,
  CommandGroup,
  CommandItem,
} from "mangue-ui";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { PickerOption } from "@/components/search-select";
import { SearchMenu } from "@/components/search-menu";
import { StatusIndicator } from "@/components/issue-indicators";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import { issueStatusForPrState } from "@/lib/pr-issue-status";
import { linkPullRequestIssueApi } from "@/lib/agent-api";
import type { PullRequestListItem } from "@/lib/agent-api";
import type { GlobalBoardResponse } from "@/lib/types";

/** Add an issue from the repository project and explain the resulting status. */
export function PrLinkIssue({
  prId,
  prState,
  projectId,
  projectKey,
  onLinked,
  linkedIssueIds = [],
  open: controlledOpen,
  onOpenChange,
  position,
  triggerClassName,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Anchor the picker to the overflow action when its inline trigger is hidden. */
  position?: { x: number; y: number };
  triggerClassName?: string;
  linkedIssueIds?: string[];
  prId: string;
  prState: PullRequestListItem["pr_state"];
  projectId: string;
  projectKey: string;
  /** The link is installed: the list and details must come from the server. */
  onLinked: () => void;
}) {
  const t = useTranslations("PullRequests");
  const tStatus = useTranslations("Status");
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [pending, setPending] = useState<{ id: string; identifier: string } | null>(null);
  const [linking, setLinking] = useState(false);

  // Same cache as the “All tickets” board and the Numo panel picker:
  // nothing is loaded until the menu is opened.
  const { data, isPending } = useQuery({
    queryKey: GLOBAL_BOARD_KEY,
    queryFn: globalBoardQueryFn,
    enabled: open,
    staleTime: 30_000,
  });

  const issues = (data?.issues ?? []) as GlobalBoardResponse["issues"];
  const options = useMemo<PickerOption[]>(() => {
    return issues
      .filter((i) => i.project_id === projectId && !linkedIssueIds.includes(i.id))
      // Open first: a PR that is attached afterwards almost aims
      // still a ticket still alive. The closes remain achievable.
      .sort((a, b) => (isClosedStatus(a.status) ? 1 : 0) - (isClosedStatus(b.status) ? 1 : 0))
      .map((i) => {
        const identifier = issueIdentifier(projectKey, i.number);
        return {
          value: i.id,
          label: `${identifier}  ${i.title}`,
          keywords: [identifier, i.title],
          icon: <StatusIndicator status={i.status} className="size-4" />,
        };
      });
  }, [issues, projectId, projectKey, linkedIssueIds]);

  const nextStatus = issueStatusForPrState(prState);

  const confirm = async () => {
    if (!pending || linking) return;
    setLinking(true);
    try {
      await linkPullRequestIssueApi(prId, pending.id, prState);
      toast.success(t("linkIssueDone", { identifier: pending.identifier }));
      setPending(null);
      onLinked();
    } catch (err) {
      // Message already translated by the server (PR already attached, ticket which carries
      // already a living PR): we show it as is.
      toast.error((err as Error).message);
    } finally {
      setLinking(false);
    }
  };

  return (
    <>
      <SearchMenu
        open={open}
        onOpenChange={setOpen}
        position={position}
        align={position ? "end" : "start"}
        searchPlaceholder={t("linkIssueSearchPlaceholder")}
        emptyText={open && isPending ? t("linkIssueLoading") : t("linkIssueEmpty")}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-6 gap-1 px-1.5 font-sans text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground", triggerClassName)}
          >
            <HugeiconsIcon icon={Link02Icon} className="size-3.5" />
            {t(linkedIssueIds.length > 0 ? "linkAnotherIssue" : "linkIssue")}
          </Button>
        }
      >
        <CommandGroup>
          {options.map((option) => (
            <CommandItem
              key={option.value}
              value={option.value}
              keywords={[option.label, ...(option.keywords ?? [])]}
              onSelect={() => {
                const issue = issues.find((candidate) => candidate.id === option.value);
                if (!issue) return;
                setPending({ id: issue.id, identifier: issueIdentifier(projectKey, issue.number) });
                setOpen(false);
              }}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </SearchMenu>

      {/* Confirm the status change before linking. */}
      <Dialog
        open={!!pending}
        onOpenChange={(next) => {
          if (!next && !linking) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("linkIssueTitle")}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t("linkIssueDescription", { identifier: pending?.identifier ?? "" })}
          </p>
          {nextStatus ? (
            <p className="text-sm text-muted-foreground">
              {t("linkIssueStatusNote", { status: tStatus(nextStatus) })}
            </p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" disabled={linking} onClick={() => setPending(null)}>
              {t("cancel")}
            </Button>
            <Button disabled={linking} onClick={() => void confirm()}>
              {linking ? <Spinner /> : null}
              {t("linkIssueConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
