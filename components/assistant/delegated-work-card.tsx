"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useNow, useTranslations } from "next-intl";
import {
  Ban,
  Bot,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  ExternalLink,
  GitBranch,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  Package,
} from "lucide-react";
import {
  Button,
  SidePanel,
  SidePanelBody,
  SidePanelContent,
  SidePanelDescription,
  SidePanelHeader,
  SidePanelTitle,
  Spinner,
  cn,
} from "mangue-ui";
import { AgentDiffSheet } from "@/components/agent/agent-diff-sheet";
import { ModelLogo } from "@/components/model-logo";
import { NumoIcon } from "@/components/numo-icon";
import {
  isAgentRunWorking,
  type AgentRunSummary,
} from "@/lib/agent-api";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import { formatModelName } from "@/lib/model-display";
import { settledAgentLocalDiff } from "@/lib/agent-local-diff";
import { sessionSubagents, type TurnSubagent } from "@/lib/agent-subagents";
import {
  delegatedWorkHiddenQuestion,
  delegatedWorkProgress,
  delegatedWorkState,
  type DelegatedWorkState,
} from "@/lib/delegated-work-state";
import {
  useAgentRunEventsQuery,
  useAgentRunQuery,
} from "@/lib/use-agent-runs";

// AgentEventFeed renders ChatMessage, which renders this card. Loading the feed
// only after the detail opens keeps that dependency one-way at module startup.
const AgentEventFeed = dynamic(
  () =>
    import("@/components/agent/agent-event-feed").then(
      (module) => module.AgentEventFeed,
    ),
  { ssr: false },
);

export interface DelegatedWorkCall {
  id: string;
  arguments?: string;
  status: "running" | "complete";
  result?: unknown;
  success?: boolean;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function argumentsOf(raw?: string): Record<string, unknown> {
  try {
    return record(raw ? JSON.parse(raw) : null);
  } catch {
    return {};
  }
}

function runIdOf(result: unknown): string | null {
  const id = record(result).run_id;
  return typeof id === "string" && id ? id : null;
}

function titleOf(call: DelegatedWorkCall, fallback: string): string {
  const args = argumentsOf(call.arguments);
  for (const value of [args.objective, args.prompt]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return fallback;
}

const STATE_ICONS = {
  starting: Loader2,
  queued: Loader2,
  running: Loader2,
  waiting_input: CircleHelp,
  completed: CheckCircle2,
  failed: CircleAlert,
  canceled: Ban,
} satisfies Record<DelegatedWorkState, React.ComponentType<{ className?: string }>>;

const REASONING_LABEL_KEYS = {
  off: "reasoningOff",
  minimal: "reasoningMinimal",
  low: "reasoningLow",
  medium: "reasoningMedium",
  high: "reasoningHigh",
  xhigh: "reasoningXhigh",
  max: "reasoningMax",
} as const satisfies Record<ReasoningLevel, string>;

/**
 * Same muted model line as the Numo composer trigger: provider logo, readable
 * model name, reasoning level in muted — a plain label, NOT the select it
 * sits inside above (no chevron).
 */
function NumoModelLine({
  model,
  reasoningLevel,
  label,
}: {
  model: string | null | undefined;
  reasoningLevel: ReasoningLevel | null | undefined;
  label: string;
}) {
  if (!model) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ModelLogo model={model} size={13} />
      <span className="truncate text-foreground/80">{formatModelName(model)}</span>
      {reasoningLevel ? (
        <span className="shrink-0 text-muted-foreground">
          {label}
        </span>
      ) : null}
    </span>
  );
}

function msOr(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallback : ms;
}

/** Compact ticking chrono, same format as the agent pill ("2 min 3s"). */
function elapsedLabel(
  t: ReturnType<typeof useTranslations<"Agent">>,
  ms: number,
): string {
  const totalSec = Math.max(1, Math.round(Math.max(0, ms) / 1000));
  const minutes = Math.floor(totalSec / 60);
  return minutes > 0
    ? t("subagentForMinutes", { minutes, seconds: totalSec % 60 })
    : t("subagentForSeconds", { seconds: totalSec });
}

/**
 * The meta line shared by the card and its side panel: state, ticking chrono,
 * model and changed files. The chrono lives in a leaf component so its 1 s
 * tick re-renders this line only — never the message that carries the card.
 * `aria-live` stays on the STATE span alone: an announced state change is
 * useful, an announced second is noise.
 */
function DelegatedWorkMeta({
  state,
  run,
  changedFileCount,
}: {
  state: DelegatedWorkState;
  run: AgentRunSummary | null | undefined;
  changedFileCount: number;
}) {
  const t = useTranslations("Agent");
  const working = state === "starting" || state === "queued" || state === "running";
  const now = useNow({ updateInterval: working ? 1000 : undefined });
  const StateIcon = STATE_ICONS[state];

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-1",
          state === "waiting_input" && "text-amber-700 dark:text-amber-400",
          state === "failed" && "text-destructive",
        )}
        aria-live="polite"
      >
        <StateIcon
          className={cn(
            "size-3.5",
            (state === "starting" || state === "queued" || state === "running") &&
              "animate-spin",
          )}
          aria-hidden
        />
        {t(`delegatedWorkState_${state}`)}
      </span>
      {working && run ? (
        <span className="shrink-0 tabular-nums">
          {elapsedLabel(t, now.getTime() - Date.parse(run.started_at ?? run.created_at))}
        </span>
      ) : null}
      <NumoModelLine
        model={run?.model}
        reasoningLevel={run?.reasoning_level}
        label={run?.reasoning_level ? t(REASONING_LABEL_KEYS[run.reasoning_level]) : ""}
      />
      {changedFileCount > 0 ? (
        <span>{t("filesChanged", { count: changedFileCount })}</span>
      ) : null}
    </div>
  );
}

/**
 * The dedicated sub-agents encart of the delegated card: what this session
 * spawned, still going or already reported back. It answers "is something
 * still moving under the hood" without opening the side panel — while a girl
 * works, the parent emits nothing and the thread above stands perfectly still.
 */
function DelegatedSubagents({ subagents }: { subagents: TurnSubagent[] }) {
  const t = useTranslations("Agent");
  const now = useNow({ updateInterval: 1000 });
  const runningCount = subagents.filter((subagent) => !subagent.endedAt).length;

  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
        {runningCount > 0 ? (
          <Spinner className="size-3" aria-hidden />
        ) : (
          <Bot className="size-3.5 shrink-0" aria-hidden />
        )}
        {runningCount > 0
          ? t("subagentsWorking", { count: runningCount })
          : t("subagentsSession")}
      </p>
      <ul className="mt-1.5 grid gap-1">
        {subagents.map((subagent) => {
          const running = !subagent.endedAt;
          const start = msOr(subagent.startedAt, now.getTime());
          const end = running ? now.getTime() : msOr(subagent.endedAt, start);

          return (
            <li
              key={subagent.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              {running ? (
                <Spinner className="size-3 shrink-0 text-blue-500" aria-hidden />
              ) : (
                <CheckCircle2 className="size-3.5 shrink-0 text-brand" aria-hidden />
              )}
              <span className="min-w-0 flex-1 truncate">
                {t(
                  subagent.mode === "implement"
                    ? "subagentImplementName"
                    : "subagentExploreName",
                )}
              </span>
              <span className="shrink-0 tabular-nums">{elapsedLabel(t, end - start)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DelegatedWorkCard({ call }: { call: DelegatedWorkCall }) {
  const t = useTranslations("Agent");
  const searchParams = useSearchParams();
  const runId = runIdOf(call.result);
  const { run } = useAgentRunQuery(runId);
  const working = run ? isAgentRunWorking(run.status) : call.status === "running";
  const { events } = useAgentRunEventsQuery(runId, working);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffFocus, setDiffFocus] = useState<string | null>(null);
  const state = delegatedWorkState(call, run);
  // The titler stamps a short `agent_runs.title` on the run at launch: prefer
  // it over the raw launch prompt, which can run for paragraphs. Until it lands
  // (or for old runs without one) the delegation arguments remain the fallback.
  const title = (run?.title ?? "").trim() || titleOf(call, t("delegatedWorkFallbackTitle"));
  const { changedFileCount } = useMemo(
    () => delegatedWorkProgress(events),
    [events],
  );
  const subagents = useMemo(() => sessionSubagents(events), [events]);
  const localDiff = useMemo(() => settledAgentLocalDiff(events), [events]);
  const artifacts = useMemo(() => {
    const values = run?.delegation_result?.artifacts ?? [];
    const seen = new Set<string>();
    return values.filter((artifact) => {
      const key = `${artifact.kind}:${artifact.ref}:${artifact.url ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return artifact.kind !== "branch" || artifact.ref !== run?.branch_name;
    });
  }, [run?.branch_name, run?.delegation_result?.artifacts]);
  const hiddenQuestionEventId = delegatedWorkHiddenQuestion(
    events,
    state === "waiting_input",
  );

  useEffect(() => {
    if (runId && searchParams.get("work") === runId) setDetailsOpen(true);
  }, [runId, searchParams]);

  const openDiff = (path?: string) => {
    setDiffFocus(path ?? null);
    setDiffOpen(true);
  };

  return (
    <>
      <div
        className={cn(
          "flex w-full flex-col gap-3 rounded-xl border bg-card p-3 shadow-xs",
          state === "waiting_input" && "border-amber-500/40",
          state === "failed" && "border-destructive/40",
        )}
        data-delegated-work-id={runId ?? call.id}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-medium leading-5">{title}</p>
            <div className="mt-1">
              <DelegatedWorkMeta
                state={state}
                run={run}
                changedFileCount={changedFileCount}
              />
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            disabled={!runId}
            onClick={() => setDetailsOpen(true)}
          >
            <NumoIcon animated={false} className="size-4" />
            {t("delegatedWorkView")}
          </Button>
        </div>
        {subagents.length > 0 ? (
          <DelegatedSubagents subagents={subagents} />
        ) : null}
        {run?.pr_url || run?.branch_name || artifacts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
            {run?.branch_name ? (
              <span className="inline-flex min-w-0 items-center gap-1">
                <GitBranch className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate font-mono">{run.branch_name}</span>
              </span>
            ) : null}
            {run?.pr_url ? (
              <Link
                href={run.pr_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-foreground hover:underline"
              >
                <GitPullRequest className="size-3.5" aria-hidden />
                {run.pr_number ? `#${run.pr_number}` : t("viewPullRequest")}
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            ) : null}
            {artifacts.map((artifact) => {
              if (
                artifact.kind === "pull_request" &&
                artifact.url === run?.pr_url
              ) return null;
              const ArtifactIcon = artifact.kind === "commit"
                ? GitCommitHorizontal
                : artifact.kind === "pull_request"
                  ? GitPullRequest
                  : Package;
              const content = (
                <>
                  <ArtifactIcon className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-64 truncate font-mono">{artifact.ref}</span>
                  {artifact.url ? <ExternalLink className="size-3 shrink-0" aria-hidden /> : null}
                </>
              );
              return artifact.url ? (
                <Link
                  key={`${artifact.kind}:${artifact.ref}:${artifact.url}`}
                  href={artifact.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-w-0 items-center gap-1 text-foreground hover:underline"
                >
                  {content}
                </Link>
              ) : (
                <span
                  key={`${artifact.kind}:${artifact.ref}`}
                  className="inline-flex min-w-0 items-center gap-1"
                >
                  {content}
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      {runId ? (
        <SidePanel open={detailsOpen} onOpenChange={setDetailsOpen}>
          <SidePanelContent
            side="right"
            // No `h-full`: on desktop the content is a floating panel docked
            // with `inset-y-4`, and forcing a viewport-height height here made
            // it extend past the bottom of the screen. The drawer mode (mobile)
            // already caps its own height (max-h-[92dvh]).
            className="flex w-[min(760px,calc(100vw-1rem))] flex-col"
          >
            <SidePanelHeader className="border-b-0">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <SidePanelTitle className="line-clamp-2 text-sm font-medium leading-5">
                  {title}
                </SidePanelTitle>
                <SidePanelDescription>
                  <DelegatedWorkMeta
                    state={state}
                    run={run}
                    changedFileCount={changedFileCount}
                  />
                </SidePanelDescription>
              </div>
            </SidePanelHeader>
            <SidePanelBody className="flex min-h-0 flex-1 flex-col p-0">
              {/* The feed scrolls itself (`overflow-y-auto`); the muted note
              stays pinned at the bottom of the panel, under the thread. */}
              <AgentEventFeed
                runId={runId}
                status={run?.status ?? "queued"}
                prompt={run?.prompt}
                promptMentions={run?.prompt_mentions}
                onOpenFile={(path) => openDiff(path)}
                onOpenDiff={() => openDiff()}
                hiddenQuestionEventId={hiddenQuestionEventId}
                localExec={run?.local_exec === true}
                className="min-h-0 flex-1 py-4"
              />
              <p className="shrink-0 border-t bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                {t("delegatedWorkNoDirectMessages")}
              </p>
            </SidePanelBody>
          </SidePanelContent>
        </SidePanel>
      ) : null}

      {runId && run ? (
        <AgentDiffSheet
          runId={runId}
          open={diffOpen}
          onOpenChange={setDiffOpen}
          working={working}
          baseBranch={run.base_branch}
          branchName={run.branch_name}
          focusPath={diffFocus}
          local={run.local_exec === true}
          localFiles={localDiff.files}
          localTruncated={localDiff.truncated}
        />
      ) : null}
    </>
  );
}
