"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Link02Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Popover, PopoverContent, PopoverTrigger } from "mangue-ui";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { issueIdentifier } from "@/lib/issue-constants";
import type { PullRequestListItem } from "@/lib/agent-api";

export function linkedIssues(item: PullRequestListItem) {
  return item.issues ?? (item.issue && item.project ? [{
    ...item.issue, project_id: item.project.id, project_key: item.project.key,
  }] : []);
}

/** Keep the primary issue visible and let the remaining issues open their panels. */
export function PrLinkedIssues({ item, onOpenIssue }: {
  item: PullRequestListItem;
  onOpenIssue: (issueId: string, projectId: string) => void;
}) {
  const t = useTranslations("PullRequests");
  const [open, setOpen] = useState(false);
  const issues = linkedIssues(item);
  const first = issues[0];
  if (!first) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      <AppTooltip label={t("linkedIssue")}><button
        type="button"
        onClick={() => onOpenIssue(first.id, first.project_id)}
        className="flex min-w-0 items-center gap-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <HugeiconsIcon icon={Link02Icon} data-testid="pr-issue-link-icon" className="size-3.5 shrink-0" aria-hidden />
        <span className="truncate">{issueIdentifier(first.project_key, first.number)}</span>
      </button></AppTooltip>
      {issues.length > 1 ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 px-1.5 text-xs text-muted-foreground"
              aria-label={t("otherLinkedIssues", { count: issues.length - 1 })}>
              +{issues.length - 1}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-1">
            {issues.slice(1).map((issue) => (
              <button key={issue.id} type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted"
                onClick={() => { setOpen(false); onOpenIssue(issue.id, issue.project_id); }}>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{issueIdentifier(issue.project_key, issue.number)}</span>
                <span className="truncate">{issue.title}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  );
}
