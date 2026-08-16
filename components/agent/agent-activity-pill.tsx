"use client";

import { useNow, useTranslations } from "next-intl";
import { Bot, CheckCircle2, Circle, CircleSlash } from "lucide-react";
import { Spinner, cn } from "mangue-ui";
import type { PlanStep } from "@/lib/agent-plan";
import type { TurnSubagent } from "@/lib/agent-subagents";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function msOr(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallback : ms;
}

function durationLabel(
  t: ReturnType<typeof useTranslations<"Agent">>,
  ms: number,
): string {
  const totalSec = Math.max(1, Math.round(Math.max(0, ms) / 1000));
  const minutes = Math.floor(totalSec / 60);
  return minutes > 0
    ? t("subagentForMinutes", { minutes, seconds: totalSec % 60 })
    : t("subagentForSeconds", { seconds: totalSec });
}

function PlanStatusIcon({ step }: { step: PlanStep }) {
  if (step.status === "completed") {
    return <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-brand" />;
  }
  if (step.status === "in_progress") {
    return <Spinner className="mt-0.5 size-3.5 shrink-0 text-blue-500" />;
  }
  if (step.status === "cancelled") {
    return <CircleSlash className="mt-0.5 size-3.5 shrink-0" />;
  }
  return <Circle className="mt-0.5 size-3.5 shrink-0" />;
}

function PlanTooltip({ steps }: { steps: PlanStep[] }) {
  const t = useTranslations("Agent");

  return (
    <div className="grid gap-2">
      <p className="font-medium text-background">{t("plan")}</p>
      <div className="grid gap-1.5">
        {steps.map((step, index) => (
          <div
            key={`${index}:${step.step}`}
            className={cn(
              "flex items-start gap-2 text-xs",
              step.status === "in_progress" ? "text-background" : "text-background/70",
              step.status === "cancelled" && "line-through",
            )}
          >
            <PlanStatusIcon step={step} />
            <span className="min-w-0">{step.step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubagentTooltip({ subagents }: { subagents: TurnSubagent[] }) {
  const t = useTranslations("Agent");
  const now = useNow({ updateInterval: 1000 });
  const runningCount = subagents.filter((subagent) => !subagent.endedAt).length;

  return (
    <div className="grid gap-2">
      <p className="font-medium text-background">
        {t("subagentsWorking", { count: runningCount })}
      </p>
      <div className="grid gap-1.5">
        {subagents.map((subagent) => {
          const running = !subagent.endedAt;
          const start = msOr(subagent.startedAt, now.getTime());
          const end = running ? now.getTime() : msOr(subagent.endedAt, start);

          return (
            <div
              key={subagent.id}
              className="flex items-center gap-2 text-xs text-background/70"
            >
              {running ? (
                <Spinner className="size-3.5 shrink-0 text-blue-500" />
              ) : (
                <CheckCircle2 className="size-3.5 shrink-0 text-brand" />
              )}
              <span className="min-w-0 flex-1 truncate">
                {t(
                  subagent.mode === "implement"
                    ? "subagentImplementName"
                    : "subagentExploreName",
                )}
              </span>
              <span className="shrink-0 tabular-nums">{durationLabel(t, end - start)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Résumé vivant de la session, juste au-dessus du composer.
 *
 * La surface reste à la largeur de son contenu : le plan, les fichiers et les
 * sous-agents sont trois indicateurs voisins dans une seule pilule, au lieu de
 * trois cartes qui prennent toute la largeur du fil. Les détails restent
 * accessibles au survol, sauf les fichiers qui ouvrent directement la diff.
 */
export function AgentActivityPill({
  planSteps,
  fileCount,
  additions,
  deletions,
  subagents,
  onOpenDiff,
}: {
  planSteps: PlanStep[];
  fileCount: number;
  additions: number;
  deletions: number;
  subagents: TurnSubagent[];
  onOpenDiff: () => void;
}) {
  const t = useTranslations("Agent");
  const currentIndex = planSteps.findIndex((step) => step.status === "in_progress");
  const completed = planSteps.filter((step) => step.status === "completed").length;
  const currentStep =
    currentIndex >= 0 ? currentIndex + 1 : Math.min(completed + 1, planSteps.length);
  const runningSubagents = subagents.filter((subagent) => !subagent.endedAt);

  if (planSteps.length === 0 && fileCount === 0 && runningSubagents.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-center px-3 pb-2">
      <div className="flex max-w-full items-center overflow-x-auto rounded-full border border-border bg-card px-3 py-2 text-xs shadow-sm">
        {planSteps.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("plan")}
                className="flex shrink-0 items-center gap-1.5 rounded-full outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Spinner className="size-3.5 text-blue-500" />
                <span className="whitespace-nowrap font-medium text-muted-foreground">
                  {t("planProgress", { current: currentStep, total: planSteps.length })}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              className="w-80 max-w-[calc(100vw-2rem)] bg-foreground text-background text-left"
            >
              <PlanTooltip steps={planSteps} />
            </TooltipContent>
          </Tooltip>
        ) : null}

        {planSteps.length > 0 && (fileCount > 0 || runningSubagents.length > 0) ? (
          <span aria-hidden="true" className="px-2 text-muted-foreground/50">
            •
          </span>
        ) : null}

        {fileCount > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onOpenDiff}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="whitespace-nowrap text-muted-foreground">
                  {t("filesChanged", { count: fileCount })}
                </span>
                {additions > 0 || deletions > 0 ? (
                  <span className="flex shrink-0 items-center gap-1 font-mono tabular-nums">
                    <span className="text-emerald-600 dark:text-emerald-400">+{additions}</span>
                    <span className="text-red-600 dark:text-red-400">−{deletions}</span>
                  </span>
                ) : null}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              className="bg-foreground text-background text-left"
            >
              {t("diffTitle")}
            </TooltipContent>
          </Tooltip>
        ) : null}

        {fileCount > 0 && runningSubagents.length > 0 ? (
          <span aria-hidden="true" className="px-2 text-muted-foreground/50">
            •
          </span>
        ) : null}

        {runningSubagents.length > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={t("subagentsWorking", { count: runningSubagents.length })}
                className="flex shrink-0 items-center gap-1.5 rounded-full outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Bot className="size-3.5 text-muted-foreground" />
                <span className="whitespace-nowrap font-medium text-muted-foreground">
                  {t("subagentsWorking", { count: runningSubagents.length })}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              sideOffset={8}
              className="w-80 max-w-[calc(100vw-2rem)] bg-foreground text-background text-left"
            >
              <SubagentTooltip subagents={subagents} />
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>
    </div>
  );
}
