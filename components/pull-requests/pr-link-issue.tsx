"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  toast,
} from "mangue-ui";
import { Link2 } from "lucide-react";
import { SearchSelect, type PickerOption } from "@/components/search-select";
import { StatusIndicator } from "@/components/issue-indicators";
import { globalBoardQueryFn } from "@/lib/global-board-api";
import { GLOBAL_BOARD_KEY } from "@/lib/use-global-board-query";
import { issueIdentifier, isClosedStatus } from "@/lib/issue-constants";
import { issueStatusForPrState } from "@/lib/pr-issue-status";
import { linkPullRequestIssueApi } from "@/lib/agent-api";
import type { PullRequestListItem } from "@/lib/agent-api";
import type { GlobalBoardResponse } from "@/lib/types";

/**
 * Attach a ticket to a PR that does not have one (MIN-163), from the header.
 *
 * The attachment is normally done BY ITSELF, by convention (project key
 * in the branch, the title, or a `Fixes:` line). When the convention was not
 * followed, the PR remained orphaned forever: this selector is the
 * catch-up, and it takes the exact place of the "no ticket" that it replaces.
 *
 * The gesture is in TWO stages, because it is definitive: we choose from the
 * same ticket picker as the /agents composer (global board loaded
 * lazily, upon opening), then we confirm in a dialog which names the
 * ticket AND announces the status it will take — the consequence is said before the
 * gesture, not after.
 *
 * Only tickets from the CE repository project are offered: this is the scope
 * that the server accepts (that of the conventional route), and offering more
 * wide would only serve to cause the confirmation to fail.
 */
export function PrLinkIssue({
  prId,
  prState,
  projectId,
  projectKey,
  onLinked,
}: {
  prId: string;
  prState: PullRequestListItem["pr_state"];
  projectId: string;
  projectKey: string;
  /** The link is installed: the list and details must come from the server. */
  onLinked: () => void;
}) {
  const t = useTranslations("PullRequests");
  const tStatus = useTranslations("Status");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ id: string; identifier: string } | null>(null);
  const [linking, setLinking] = useState(false);

  // Same cache as the “All tickets” board and the /agents picker:
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
      .filter((i) => i.project_id === projectId)
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
  }, [issues, projectId, projectKey]);

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
      <SearchSelect
        value={null}
        onChange={(issueId) => {
          if (!issueId) return;
          const issue = issues.find((i) => i.id === issueId);
          if (!issue) return;
          setPending({ id: issue.id, identifier: issueIdentifier(projectKey, issue.number) });
        }}
        options={options}
        open={open}
        onOpenChange={setOpen}
        align="start"
        searchPlaceholder={t("linkIssueSearchPlaceholder")}
        emptyText={open && isPending ? t("linkIssueLoading") : t("linkIssueEmpty")}
        trigger={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 font-sans text-xs font-normal text-muted-foreground"
          >
            <Link2 className="size-3.5" />
            {t("linkIssue")}
          </Button>
        }
      />

      {/* Confirmation — the attachment is not canceled, it is confirmed. */}
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
