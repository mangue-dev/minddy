"use client";

import { TruncatedText } from "@/components/ui/truncated-text";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, HierarchySquare01Icon } from "@hugeicons/core-free-icons";
import { memo, useMemo, useRef } from "react";
import { useTranslations } from "next-intl";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";
import { SplitButton } from "@/components/ui/split-button";
import { NumoIcon } from "@/components/numo-icon";
import { cn } from "@/lib/utils";
import { isClosedStatus, issueIdentifier } from "@/lib/issue-constants";
import { StatusIndicator } from "@/components/issue-indicators";
import { MentionHover } from "@/components/mention-hover";
import { useCreateOptional } from "@/lib/create-context";
import { useAssistantPanelActions } from "@/lib/assistant-panel-context";
import { issuesPageContext } from "@/lib/assistant-issue-context";
import type { Issue } from "@/lib/types";

// Memoized (MIN-875): the detail panels re-render for each query they read.
/**
 * Parent-side view of its children: progress, the list, then "Create a
 * sub-issue", which opens the creation dialog with this issue as parent; its
 * menu adds an existing issue as a sub-issue, or asks Numo to split the issue
 * into sub-issues instead.
 */
export const SubIssuesSection = memo(function SubIssuesSection({
  issue,
  allIssues,
  projectKey,
  onOpenIssue,
  onAddExisting,
  readOnly = false,
}: {
  issue: Issue;
  allIssues: Issue[];
  projectKey: string;
  onOpenIssue: (id: string) => void;
  /** Opens the picker of existing issues that may become sub-issues of this
      one (the `parent_of` relation step). Absent: the entry is not offered. */
  onAddExisting?: () => void;
  /** Project readers: sub-issues are listed without the create button. */
  readOnly?: boolean;
}) {
  const t = useTranslations("IssueUI");
  const tIssue = useTranslations("Issue");
  const create = useCreateOptional();
  const { openIntent } = useAssistantPanelActions();
  const identifier = issueIdentifier(projectKey, issue.number);
  const children = useMemo(
    () =>
      allIssues
        .filter((i) => i.parent_id === issue.id)
        .sort((a, b) => a.number - b.number),
    [allIssues, issue.id]
  );


  const total = children.length;
  // A canceled (or duplicate) sub-ticket is finished for tracking, in the same way
  // only one finished: it will never be worked on. Same convention as
  // statusCompletionCredit (lib/cycle.ts), which gives 1 to any closed status.
  const done = children.filter((c) => isClosedStatus(c.status)).length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  // The picker opens once the dropdown has closed: opened earlier, it would
  // lose its focus to the dropdown's exit (same as the Relations row).
  const pendingAddExisting = useRef(false);

  const createSubIssue = () =>
    create?.openCreateIssue({ projectId: issue.project_id, parentId: issue.id });
  const splitWithNumo = () =>
    openIntent({
      source: "issue",
      action: "plan",
      projectId: issue.project_id,
      prompt: t("splitWithNumoPrompt", { identifier }),
      pageContext: issuesPageContext([issue], () => identifier),
    });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">{tIssue("subEntityPlural")}</span>
        {total > 0 && (
          <span className="text-xs text-muted-foreground">
            {done}/{total}
          </span>
        )}
        {total > 0 && <Progress value={percent} className="ml-auto w-24" />}
      </div>

      {children.length > 0 && (
        <div className="mb-2 flex flex-col">
          {children.map((child) => {
            // The sub-issue's card on hover, as on the relation rows (MIN-879).
            return (
              <MentionHover key={child.id} type="issue" id={child.id} project={issue.project_id}
                side="left" onOpen={() => onOpenIssue(child.id)}>
              <button
                type="button"
                onClick={() => onOpenIssue(child.id)}
                className="flex items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted/60"
              >
                <StatusIndicator status={child.status} className="size-4 shrink-0" />
                <span className="min-w-14 shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">
                  {issueIdentifier(projectKey, child.number)}
                </span>
                <TruncatedText
                  text={child.title}
                  className={cn(
                    "flex-1 truncate text-sm",
                    isClosedStatus(child.status) &&
                      "text-muted-foreground line-through"
                  )}
                />
              </button>
              </MentionHover>
            );
          })}
        </div>
      )}

      {!readOnly && create && (
        // The size of a wizard's main button: the section's one action, across its width.
        <SplitButton
          variant="outline"
          size="lg"
          className="w-full"
          actionClassName="flex-1"
          onClick={createSubIssue}
          menuLabel={t("moreSubIssueOptions")}
          menuAlign="start"
          menuContentProps={{
            onCloseAutoFocus: (event) => {
              if (!pendingAddExisting.current) return;
              pendingAddExisting.current = false;
              event.preventDefault();
              onAddExisting?.();
            },
          }}
          menu={
            <>
              {onAddExisting && (
                <DropdownMenuItem onSelect={() => { pendingAddExisting.current = true; }}>
                  <HugeiconsIcon icon={HierarchySquare01Icon} />
                  {t("addExistingSubIssue")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={splitWithNumo}>
                <NumoIcon className="size-4" />
                {t("splitWithNumo")}
              </DropdownMenuItem>
            </>
          }
        >
          <HugeiconsIcon icon={Add01Icon} data-icon="inline-start" />
          {t("createSubIssue")}
        </SplitButton>
      )}
    </div>
  );
});
