"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Progress,
} from "mangue-ui";
import {
  ChevronDown,
  ClipboardCopy,
  Code2,
  ListChecks,
  Pencil,
  SearchCheck,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import { NumoIcon } from "@/components/numo-icon";
import { TaskRow } from "@/components/plan-task-row";
import {
  parsePlan,
  setTaskState,
  type PlanTask,
  type PlanTaskState,
} from "@/lib/plan";
import { trackEvent } from "@/lib/analytics";
import { isSendShortcut } from "@/lib/keyboard/send-shortcut";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The issue's implementation plan (Plan tab of the side panel): rendered
 * markdown with interactive task rows by default, raw-markdown editing behind
 * an explicit Save/Cancel (a blur-commit would fire spurious task events on a
 * half-edited plan). The markdown is the single source of truth — every task
 * interaction rewrites one line and commits the full document (lib/plan.ts).
 *
 * Empty shot: three ways to fill it — let a Numo agent frame it,
 * copy the prompt for an external agent (MCP), or write it by hand. Both
 * first are optional: the panel only passes them when they have a
 * meaning (authorized agents + linked deposit for Numo).
 *
 * Completed plan: the plan is written, the next step is to IMPLEMENT it — that’s the
 * main button, at the head of the tab. Below, the two ways to
 * take it again first: have it checked point by point by Numo, or copy a
 * prompt for an external agent (choice: implement, or verify the plan).
 *
 * Work started (at least one task checked): the main button becomes
 * “Check the implementation” — reread what was done against the plan and
 * comments, fix real bugs. The prompt menu does not replace
 * nothing: he gains an entry, so that a half-made plan still leaves room for copying
 * the implementation prompt.
 */
export function IssuePlan({
  plan,
  onCommit,
  onWriteWithAgent,
  onCopyPrompt,
  onImplementWithAgent,
  onCopyImplementPrompt,
  onVerifyWithAgent,
  onCopyVerifyPrompt,
}: {
  plan: string | null;
  onCommit: (plan: string | null) => void;
  /** Opens the agent composer with a “write/verify plan” prompt. */
  onWriteWithAgent?: () => void;
  /** Copies the “write/verify plan” prompt to an external agent. */
  onCopyPrompt?: () => void;
  /** Opens the agent composer with the prompt “implements ticket”. */
  onImplementWithAgent?: () => void;
  /** Copies the “implement ticket” prompt to an external agent. */
  onCopyImplementPrompt?: () => void;
  /** Opens the agent composer with the "check implementation" prompt. */
  onVerifyWithAgent?: () => void;
  /** Copies the "check implementation" prompt for an external agent. */
  onCopyVerifyPrompt?: () => void;
}) {
  const t = useTranslations("Plan");
  const tIssue = useTranslations("IssueUI");
  const tCommon = useTranslations("Common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const { segments, progress } = useMemo(() => parsePlan(plan), [plan]);
  const percent =
    progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  // A plan with tasks CHECKS; markdown without stain (prose
  // only) remains to be written — same definition as `hasPlanTasks`, so that the
  // labels stick to the prompts that the callbacks trigger.
  const reviewing = progress.total > 0;
  // At least one task checked = work has been done, so there is something
  // to be checked. Canceled tasks and questions don't count (parsePlan
  // already excludes them from `done`): they are not written code.
  const started = progress.done > 0;

  const startEditing = () => {
    setDraft(plan ?? "");
    setEditing(true);
  };
  const saveDraft = () => {
    const next = draft.trim() ? draft : null;
    if (next !== (plan ?? null)) onCommit(next);
    setEditing(false);
  };

  const commitTaskState = (task: PlanTask, state: PlanTaskState) => {
    if (!plan || task.state === state) return;
    trackEvent("plan_task_toggled", { to_state: state });
    onCommit(setTaskState(plan, task.line, state));
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // The plan editor is a DOCUMENT, not a message: Enter done
            // a line regardless of the account setting, hence the call without
            // mode — but the definition of the gesture remains the only one in the app.
            if (isSendShortcut(e)) {
              e.preventDefault();
              saveDraft();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
            }
          }}
          placeholder={t("editorPlaceholder")}
          autoFocus
          spellCheck={false}
          className="min-h-[45vh] w-full resize-y rounded-lg border border-input bg-control p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring"
        />
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
            {tCommon("cancel")}
          </Button>
          <Button size="sm" onClick={saveDraft}>
            {tCommon("save")}
          </Button>
        </div>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <p className="text-sm font-medium">{t("emptyTitle")}</p>
        <p className="max-w-sm text-xs text-muted-foreground">{t("emptyHint")}</p>
        {/* The two ways of having the plan written, then - behind - the one
 which consists of writing it yourself. */}
        {(onWriteWithAgent || onCopyPrompt) && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onWriteWithAgent && (
              <Button size="sm" onClick={onWriteWithAgent}>
                <NumoIcon animated={false} className="size-4" />
                {t("writeWithNumo")}
              </Button>
            )}
            {onCopyPrompt && (
              // The wording does not say WHICH prompt: the tooltip says so.
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" onClick={onCopyPrompt}>
                    <ClipboardCopy className="size-4" />
                    {t("copyPlanPrompt")}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-64">
                  {t("copyPlanPromptHint")}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}
        <Button
          variant={onWriteWithAgent || onCopyPrompt ? "ghost" : "outline"}
          size="sm"
          onClick={startEditing}
        >
          {t("addPlan")}
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {progress.total > 0 && (
          <>
            <span className="text-xs text-muted-foreground">
              {progress.done}/{progress.total}
            </span>
            <Progress value={percent} className="w-24" />
          </>
        )}
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("editAriaLabel")}
          className="rounded-full text-muted-foreground hover:text-foreground"
          onClick={startEditing}
        >
          <Pencil />
        </Button>
      </div>

      {/* What you do with a written plan. Implementing it is the expected action —
 only full button, replaced by “Check implementation” as soon as a
 task is checked: the work has started, what we then want is to re-read it; below, the two ways to resume the plan itself.
 Numo only appears where it can work (the panel only passes its
 callbacks in this case); Copyable prompts serve
 external agents and always remain there. */}
      {(onImplementWithAgent ||
        onVerifyWithAgent ||
        onWriteWithAgent ||
        onCopyPrompt ||
        onCopyImplementPrompt ||
        onCopyVerifyPrompt) && (
        <div className="mb-4 flex flex-col gap-2">
          {started && onVerifyWithAgent ? (
            <Button className="w-full" onClick={onVerifyWithAgent}>
              <NumoIcon animated={false} className="size-4" />
              {t("verifyWithNumo")}
            </Button>
          ) : (
            onImplementWithAgent && (
              <Button className="w-full" onClick={onImplementWithAgent}>
                <NumoIcon animated={false} className="size-4" />
                {t("implementWithNumo")}
              </Button>
            )
          )}
          <div className="flex flex-wrap gap-2">
            {onWriteWithAgent && (
              <Button
                variant="outline"
                // `grow basis-*` rather than `flex-1`: the buttons share the
                // line when it is wide enough, without ever trimming their
                // label (the component is `shrink-0`) — otherwise they go to the
                // line, each across the entire width.
                className="grow basis-40"
                onClick={onWriteWithAgent}
              >
                <NumoIcon animated={false} className="size-4" />
                {t(reviewing ? "reviewWithNumo" : "writeWithNumo")}
              </Button>
            )}
            {(onCopyPrompt ||
              onCopyImplementPrompt ||
              (started && onCopyVerifyPrompt)) && (
              // The wording does not say WHICH prompt: the menu asks for it — the
              // same ways of working on the ticket as the “⋯” menu.
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="grow basis-32">
                    <ClipboardCopy className="size-4" />
                    {t("copyPlanPrompt")}
                    <ChevronDown className="size-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {onCopyImplementPrompt && (
                    <DropdownMenuItem onSelect={onCopyImplementPrompt}>
                      <Code2 className="size-4" />
                      {tIssue("actionImplement")}
                    </DropdownMenuItem>
                  )}
                  {started && onCopyVerifyPrompt && (
                    <DropdownMenuItem onSelect={onCopyVerifyPrompt}>
                      <SearchCheck className="size-4" />
                      {tIssue("actionVerifyImplementation")}
                    </DropdownMenuItem>
                  )}
                  {onCopyPrompt && (
                    <DropdownMenuItem onSelect={onCopyPrompt}>
                      <ListChecks className="size-4" />
                      {tIssue(reviewing ? "actionReviewPlan" : "actionWritePlan")}
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        {segments.map((segment, i) =>
          segment.kind === "prose" ? (
            <Markdown key={i}>{segment.markdown}</Markdown>
          ) : (
            <div key={i} className="my-1 flex flex-col">
              {segment.tasks.map((task) => (
                <TaskRow
                  key={`${task.line}-${task.text}`}
                  task={task}
                  onSetState={(state) => commitTaskState(task, state)}
                />
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
