"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AppIcon } from "@/components/icon";
import { ArrowDown01Icon, CodeSimpleIcon as Code2, Copy01Icon, Search01Icon, TaskDone01Icon } from "@hugeicons/core-free-icons";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Progress,
} from "mangue-ui";
import { DeferredDocumentEditor } from "@/components/editor/document-editor-lazy";
import type { DocumentEditorMentions } from "@/components/editor/document-editor";
import type { DescriptionCollaborationSession } from "@/lib/use-description-collaboration";
import { parsePlan } from "@/lib/plan";

/**
 * The issue's implementation plan (Plan tab of the side panel), edited in
 * place like the description (MIN-728): the shared editor, live with the
 * other people, Numo and agents on the same plan. Tasks are the editor's
 * four-state task blocks; their Markdown is the plan format of lib/plan.ts,
 * which every agent tool reads (`issues.plan` is the projection).
 *
 * The actions copy a prompt for the user's own coding agent: write or review
 * the plan, implement the issue, or check the implementation once a task is
 * done.
 */
export function IssuePlan({
  issueId,
  projectId,
  plan,
  live,
  mentions,
  onCommit,
  onCopyPrompt,
  onCopyImplementPrompt,
  onCopyVerifyPrompt,
  readOnly = false,
}: {
  issueId: string;
  projectId: string;
  plan: string | null;
  /** The plan's live session (lib/use-description-collaboration.ts). */
  live: DescriptionCollaborationSession;
  mentions: DocumentEditorMentions;
  /** Saves the Markdown when no live session is available. */
  onCommit: (plan: string | null) => void;
  /** Project readers: the plan is shown without edit or task controls. */
  readOnly?: boolean;
  /** Copies the “write/review plan” prompt to an external agent. */
  onCopyPrompt?: () => void;
  /** Copies the “implement ticket” prompt to an external agent. */
  onCopyImplementPrompt?: () => void;
  /** Copies the "check implementation" prompt for an external agent. */
  onCopyVerifyPrompt?: () => void;
}) {
  const t = useTranslations("Plan");
  const tIssue = useTranslations("IssueUI");
  // The text on screen, so the progress follows typing before its Markdown
  // is written back to the issue.
  const [typed, setTyped] = useState<string | null>(null);
  const edited = useRef(false);
  const shown = typed ?? plan ?? "";

  const { progress } = useMemo(() => parsePlan(shown), [shown]);
  const percent =
    progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  // A plan with tasks is REVIEWED; one without is still to be written — the
  // same definition as `hasPlanTasks`, so the labels match the prompts.
  const reviewing = progress.total > 0;
  // At least one task done = work to check. Cancelled tasks and questions do
  // not count (parsePlan already excludes them from `done`).
  const started = progress.done > 0;

  const liveReady = live.status === "ready" && !!live.collaboration;
  const placeholder = readOnly ? t("emptyTitle") : t("placeholder");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-h-8 items-center gap-2">
        {progress.total > 0 && (
          <>
            <span className="text-xs text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
            <Progress value={percent} className="w-24" />
          </>
        )}
        <span className="flex-1" />
        {!readOnly && (onCopyPrompt || onCopyImplementPrompt || (started && onCopyVerifyPrompt)) && (
          // The wording does not say WHICH prompt: the menu asks for it — the
          // same ways of working on the ticket as the “⋯” menu.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <HugeiconsIcon icon={Copy01Icon} className="size-4" />
                {t("copyPlanPrompt")}
                <HugeiconsIcon icon={ArrowDown01Icon} className="size-3.5 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {onCopyPrompt && (
                <DropdownMenuItem onSelect={onCopyPrompt}>
                  <HugeiconsIcon icon={TaskDone01Icon} className="size-4" />
                  {tIssue(reviewing ? "actionReviewPlan" : "actionWritePlan")}
                </DropdownMenuItem>
              )}
              {onCopyImplementPrompt && (
                <DropdownMenuItem onSelect={onCopyImplementPrompt}>
                  <AppIcon icon={Code2} className="size-4" />
                  {tIssue("actionImplement")}
                </DropdownMenuItem>
              )}
              {started && onCopyVerifyPrompt && (
                <DropdownMenuItem onSelect={onCopyVerifyPrompt}>
                  <HugeiconsIcon icon={Search01Icon} className="size-4" />
                  {tIssue("actionVerifyImplementation")}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {live.status === "loading" ? (
        // The plan, formatted, while its live session loads: the live editor
        // then takes its place in the same frame.
        <DeferredDocumentEditor
          key={`${issueId}:plan-preview`}
          mentions={mentions}
          value={plan ?? ""}
          placeholder={placeholder}
          readOnly
        />
      ) : liveReady ? (
        <DeferredDocumentEditor
          key={`${issueId}:plan-live`}
          mentions={mentions}
          value={plan ?? ""}
          uploadScope={`projects/${projectId}`}
          document={live.doc}
          collaboration={live.collaboration}
          onChange={(markdown) => setTyped(markdown)}
          placeholder={placeholder}
          readOnly={readOnly}
        />
      ) : (
        // Without a live session (an older server, a failed read), the plan
        // is saved as Markdown when the editor loses focus.
        <DeferredDocumentEditor
          key={`${issueId}:plan`}
          mentions={mentions}
          value={plan ?? ""}
          uploadScope={`projects/${projectId}`}
          onChange={(markdown) => setTyped(markdown)}
          onEdit={() => {
            edited.current = true;
          }}
          onCommit={(markdown) => {
            if (!edited.current) return;
            edited.current = false;
            const next = markdown.trim() ? markdown : null;
            if (next !== (plan ?? null)) onCommit(next);
          }}
          placeholder={placeholder}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}
