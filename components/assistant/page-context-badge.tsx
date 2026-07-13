"use client";

import { useTranslations } from "next-intl";
import { FileText, IterationCw, LayoutGrid, MessagesSquare, Target } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger, cn } from "mangue-ui";
import type { AssistantPageContext } from "@/lib/assistant-types";

/**
 * Context chip for the assistant: what the user is looking at (an open issue,
 * an objective board, or a board onglet). Rendered above a message bubble and
 * inside the composer; `className` lets the caller tune the radius for
 * concentric nesting in the composer.
 */
export function PageContextBadge({
  context,
  className,
}: {
  context: AssistantPageContext;
  className?: string;
}) {
  const t = useTranslations("Assistant");

  let icon = <LayoutGrid className="h-3 w-3" />;
  let label: string;
  let tooltip: string;

  if (context.issueId) {
    icon = <FileText className="h-3 w-3" />;
    label = context.issueIdentifier
      ? context.issueTitle
        ? `${context.issueIdentifier} — ${context.issueTitle}`
        : context.issueIdentifier
      : (context.issueTitle ?? t("contextIssue"));
    tooltip = t("contextIssue");
  } else if (context.objectiveId) {
    icon = <Target className="h-3 w-3" />;
    label = context.objectiveName ?? t("contextObjective");
    tooltip = t("contextObjective");
  } else if (context.feedbackId) {
    icon = <MessagesSquare className="h-3 w-3" />;
    label = context.feedbackTitle ?? t("contextFeedback");
    tooltip = t("contextFeedback");
  } else if (context.cycleId) {
    icon = <IterationCw className="h-3 w-3" />;
    label = t("contextCycle", { label: context.cycleLabel ?? "" });
    tooltip = t("contextCycle", { label: context.cycleLabel ?? "" });
  } else {
    // Prefer the selected view's name; the onglet fallback only concerns
    // messages persisted before views v2 (single tab since).
    label =
      context.viewName ??
      (context.onglet === "my" ? t("contextBoardMy") : t("contextBoardAll"));
    tooltip = t("contextBoard");
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={tooltip}
          className={cn(
            "flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-2.5 text-xs text-muted-foreground shadow-sm",
            className,
          )}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border border-border/60 bg-muted text-muted-foreground">
            {icon}
          </span>
          <span className="min-w-0 truncate font-medium text-foreground/80">
            {label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" align="end" sideOffset={6}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
