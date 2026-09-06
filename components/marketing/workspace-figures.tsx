import { getTranslations } from "next-intl/server";
import { PriorityIndicator, StatusIndicator, EffortIndicator } from "@/components/issue-indicators";
import { NumoFace } from "@/components/numo-face";
import { NotebookFigure } from "./notebook-figure";

/** A compact board built from the same status, priority, and effort components as issue cards. */
export async function BoardFigure() {
  const [t, status] = await Promise.all([getTranslations("Landing"), getTranslations("Status")]);
  const tasks = [
    { key: "repro", status: "todo", priority: "medium", effort: "s" },
    { key: "signature", status: "in_progress", priority: "high", effort: "m" },
    { key: "retry", status: "in_review", priority: "high", effort: "s" },
  ] as const;
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-background text-foreground shadow-sm" role="img" aria-label={t("feature_board_title")}>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs font-medium">
        <span className="size-2 rounded-full bg-primary" />Aurora<span className="text-muted-foreground">/</span>{t("navMenu_tracker_title")}
      </div>
      <div className="grid gap-2 p-3 sm:grid-cols-3">
        {tasks.map((task, index) => (
          <div key={task.key} className="min-w-0 rounded-lg bg-muted/50 p-2">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium"><StatusIndicator status={task.status} />{status(task.status)}<span className="ml-auto text-muted-foreground">1</span></div>
            <div className="rounded-lg border border-border bg-card p-3 shadow-xs">
              <span className="font-mono text-[10px] text-muted-foreground">AUR-{index + 7}</span>
              <p className="mt-2 text-sm leading-snug sm:min-h-15">{t(`heroLoopTask_${task.key}`)}</p>
              <div className="mt-4 flex items-center gap-3"><PriorityIndicator priority={task.priority} /><EffortIndicator effort={task.effort} />{task.status === "in_progress" && <NumoFace className="ml-auto h-4 w-5" />}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export async function ScratchpadFigure() {
  const t = await getTranslations("Landing");
  return <NotebookFigure title={t("heroLoopIssueTitle")} tasks={(["repro", "signature", "retry"] as const).map(key => t(`heroLoopTask_${key}`))} />;
}

/** Readable execution steps using the product's task status indicators. */
export async function AgentWorkFigure() {
  const t = await getTranslations("Landing");
  return (
    <div className="rounded-xl border border-border bg-background p-5 text-foreground shadow-sm">
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-4 text-sm font-medium"><NumoFace className="h-4 w-5" />{t("heroLoopStepRun")}</div>
      <p className="mb-4 text-sm font-medium">{t("heroLoopIssueTitle")}</p>
      <ul className="space-y-4">
        {(["repro", "signature", "retry"] as const).map(key => <li key={key} className="flex items-start gap-3 text-sm"><StatusIndicator status="done" /><span>{t(`heroLoopTask_${key}`)}</span></li>)}
      </ul>
      <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">{t("heroLoopRunDetail")}</p>
    </div>
  );
}
