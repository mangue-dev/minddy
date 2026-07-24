"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Button, Progress } from "mangue-ui";
import { Pencil } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { TaskRow } from "@/components/plan-task-row";
import {
  parsePlan,
  setTaskState,
  type PlanTask,
  type PlanTaskState,
} from "@/lib/plan";
import { trackEvent } from "@/lib/analytics";

/**
 * The issue's implementation plan (Plan tab of the side panel): rendered
 * markdown with interactive task rows by default, raw-markdown editing behind
 * an explicit Save/Cancel (a blur-commit would fire spurious task events on a
 * half-edited plan). The markdown is the single source of truth — every task
 * interaction rewrites one line and commits the full document (lib/plan.ts).
 */
export function IssuePlan({
  plan,
  onCommit,
}: {
  plan: string | null;
  onCommit: (plan: string | null) => void;
}) {
  const t = useTranslations("Plan");
  const tCommon = useTranslations("Common");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const { segments, progress } = useMemo(() => parsePlan(plan), [plan]);
  const percent =
    progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

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
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
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
          className="min-h-[45vh] w-full resize-y rounded-lg border border-border bg-transparent p-3 font-mono text-sm leading-relaxed outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring"
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
        <Button variant="outline" size="sm" onClick={startEditing}>
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
