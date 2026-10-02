"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon, Cancel01Icon, Link02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Popover, PopoverContent, PopoverTrigger, Spinner } from "mangue-ui";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { useUnlinkPullRequestIssue } from "@/lib/use-unlink-pull-request-issue";
import { issueIdentifier } from "@/lib/issue-constants";
import type { PullRequestListItem } from "@/lib/agent-api";

export function linkedIssues(item: PullRequestListItem) {
  return item.issues ?? (item.issue && item.project ? [{
    ...item.issue, project_id: item.project.id, project_key: item.project.key,
  }] : []);
}

/** Show one issue inline, or keep all linked issues together in a popover. */
export function PrLinkedIssues({ item, onOpenIssue }: {
  item: PullRequestListItem;
  onOpenIssue: (issueId: string, projectId: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const unlink = useUnlinkPullRequestIssue();
  const [open, setOpen] = useState(false);
  const issues = linkedIssues(item);
  const first = issues[0];
  if (!first) return null;
  const unlinkButton = (issue: typeof first) => {
    const identifier = issueIdentifier(issue.project_key, issue.number);
    const label = t("unlinkIssueLabel", { identifier });
    return <AppTooltip label={label}>
      <Button variant="ghost" size="icon-sm" className="size-6 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
        aria-label={label} disabled={unlink.isPending}
        onClick={() => unlink.mutate({ prId: item.prId, issueId: issue.id, identifier })}>
        {unlink.isPending && unlink.variables?.issueId === issue.id
          ? <Spinner className="size-3.5" />
          : <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" aria-hidden />}
      </Button>
    </AppTooltip>;
  };
  return (
    <span className="flex min-w-0 items-center gap-1">
      {issues.length === 1 ? (
        <>
          <AppTooltip label={t("linkedIssue")}>
            <button
              type="button"
              onClick={() => onOpenIssue(first.id, first.project_id)}
              className="flex min-w-0 items-center gap-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <HugeiconsIcon icon={Link02Icon} data-testid="pr-issue-link-icon" className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">{issueIdentifier(first.project_key, first.number)}</span>
            </button>
          </AppTooltip>
          {unlinkButton(first)}
        </>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 font-sans text-xs font-normal text-muted-foreground">
              <HugeiconsIcon icon={Link02Icon} className="size-3.5" aria-hidden />
              {t("linkedIssues", { count: issues.length })}
              <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5" aria-hidden />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-80 w-80 overflow-y-auto p-1">
            {issues.map((issue) => (
              <div key={issue.id} className="flex items-center gap-1">
                <button type="button"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                  onClick={() => { setOpen(false); onOpenIssue(issue.id, issue.project_id); }}>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">{issueIdentifier(issue.project_key, issue.number)}</span>
                  <span className="truncate">{issue.title}</span>
                </button>
                {unlinkButton(issue)}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
