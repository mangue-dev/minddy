"use client";

import { orderIssuesForSearch } from "@/lib/issue-search-order";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link02Icon } from "@hugeicons/core-free-icons";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PickerLoading, issuePickerRow } from "@/components/palette-picker-rows";
import { usePalettePicker, type PalettePickerRequest } from "@/lib/palette-picker";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { issueIdentifier } from "@/lib/issue-constants";
import { issueStatusForPrState } from "@/lib/pr-issue-status";
import { linkPullRequestIssueApi } from "@/lib/agent-api";
import type { PullRequestListItem } from "@/lib/agent-api";
import type { GlobalBoardResponse } from "@/lib/types";

/**
 * Add an issue from the repository project and explain the resulting status.
 * The issue is picked in the ⌘K palette (MIN-844), then confirmed here.
 */
export function PrLinkIssue({
  prId,
  prState,
  projectId,
  projectKey,
  onLinked,
  linkedIssueIds = [],
  open: controlledOpen,
  onOpenChange,
  triggerClassName,
}: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
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
  // Work under way first — a PR almost always targets a live issue — then
  // open issues; triage and closed ones last, still selectable (MIN-726).
  // Callers rebuild the linked list on every render: compared by content.
  const linkedKey = linkedIssueIds.join(",");
  const candidates = useMemo(() => {
    const linked = new Set(linkedKey ? linkedKey.split(",") : []);
    return orderIssuesForSearch(
      issues.filter((i) => i.project_id === projectId && !linked.has(i.id)),
      (i) => i.status,
    );
  }, [issues, projectId, linkedKey]);
  const setOpenRef = useRef(setOpen);
  setOpenRef.current = setOpen;
  const request = useMemo<PalettePickerRequest | null>(() => {
    if (!open) return null;
    return {
      key: `pull-request-link-issue:${prId}`,
      placeholder: t("linkIssueSearchPlaceholder"),
      categories: [{ id: "pull-request-issues", label: t("linkIssue") }],
      items: candidates.map((issue) =>
        issuePickerRow(issue, projectKey, "pull-request-issues", () => {
          setPending({ id: issue.id, identifier: issueIdentifier(projectKey, issue.number) });
          setOpenRef.current(false);
        })),
      // Same eligible issues, found by meaning (MIN-718).
      semanticProjectId: projectId,
      status: isPending
        ? <PickerLoading label={t("linkIssueLoading")} />
        : candidates.length === 0 ? t("linkIssueEmpty") : undefined,
      onClose: () => setOpenRef.current(false),
    };
  }, [open, prId, candidates, projectKey, projectId, isPending, t]);
  usePalettePicker(request);

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
      <Button
        variant="ghost"
        size="sm"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn("h-6 gap-1 px-1.5 font-sans text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground", triggerClassName)}
      >
        <HugeiconsIcon icon={Link02Icon} className="size-3.5" />
        {t(linkedIssueIds.length > 0 ? "linkAnotherIssue" : "linkIssue")}
      </Button>

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
