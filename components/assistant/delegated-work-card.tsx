"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { AlertCircleIcon, BotIcon, CancelCircleIcon as Ban, CheckIcon, Copy01Icon, GitBranchIcon, GitCommitIcon, GitPullRequestIcon, HelpCircleIcon, LinkSquare01Icon, LoaderCircleIcon, MoreHorizontalIcon, PackageIcon, SquareIcon } from "@hugeicons/core-free-icons";
import dynamic from "next/dynamic";
import Link from "@/components/app-link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useNow, useTranslations } from "next-intl";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Spinner,
  toast,
  cn,
} from "mangue-ui";
import { SidePanel, SidePanelBody, SidePanelContent, SidePanelDescription, SidePanelHeader, SidePanelTitle } from "@/components/ui/side-panel";
import { AgentDiffSheet } from "@/components/agent/agent-diff-sheet";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { AppIcon } from "@/components/icon";
import { ModelLogo } from "@/components/model-logo";
import { AgentEngineBadge } from "@/components/agent/agent-engine-badge";
import { agentEngineDisplay } from "@/lib/agent-engine-display";
import { isNativeAgentEngine } from "@/lib/agent-engines";
import {
  interruptAgentRunApi,
  isAgentRunWorking,
  type AgentRunSummary,
} from "@/lib/agent-api";
import type { ReasoningLevel } from "@/lib/agent-reasoning";
import { formatModelName } from "@/lib/model-display";
import { delegatedWorkDurationMs } from "@/lib/delegated-work-duration";
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
  starting: LoaderCircleIcon,
  queued: LoaderCircleIcon,
  running: LoaderCircleIcon,
  stopping: LoaderCircleIcon,
  waiting_input: HelpCircleIcon,
  completed: CheckIcon,
  failed: AlertCircleIcon,
  canceled: Ban,
} satisfies Record<DelegatedWorkState, AppIcon>;

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
  label,
  name,
}: {
  model: string | null | undefined;
  label: string;
  name?: string;
}) {
  if (!model) return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <ModelLogo model={model} size={13} />
      <span className="truncate text-foreground/80">{name ?? formatModelName(model)}</span>
      {label ? (
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

/** Keep interruption in the same actions menu on the card and worker details. */
function DelegatedWorkStopButton({ working, stopping, onStop }: {
  working: boolean;
  stopping: boolean;
  onStop: () => void;
}) {
  const t = useTranslations("Agent");
  if (!working) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" size="icon-sm" variant="ghost"
          className="shrink-0 text-muted-foreground" disabled={stopping}
          aria-label={t("delegatedWorkActions")}>
          {stopping ? <Spinner className="size-4" aria-hidden />
            : <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem variant="destructive" onSelect={onStop}>
          <HugeiconsIcon icon={SquareIcon} className="size-3.5" aria-hidden />
          {t("delegatedWorkStop")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DelegatedBranchLine({ branch }: { branch: string }) {
  const t = useTranslations("PullRequests");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(branch); setCopied(true); }
    catch { toast.error(t("copyFailed")); }
  };
  return <div className="flex w-full min-w-0 items-center gap-2">
    <HugeiconsIcon icon={GitBranchIcon} className="size-3.5 shrink-0" aria-hidden />
    <AppTooltip label={branch}><span className="min-w-0 flex-1 truncate font-mono">{branch}</span></AppTooltip>
    <AppTooltip label={t("copyBranch")}><Button type="button" size="icon-sm" variant="ghost"
      className="shrink-0 text-muted-foreground" aria-label={t("copyBranch")} onClick={() => void copy()}>
      <HugeiconsIcon icon={copied ? CheckIcon : Copy01Icon} className="size-3.5" aria-hidden />
    </Button></AppTooltip>
  </div>;
}

function DelegatedPrButton({ run }: { run: AgentRunSummary }) {
  const t = useTranslations("Agent");
  if (!run.pr_url) return null;
  return <Button asChild variant="outline" size="sm" className="w-full">
    <Link href={`/pull-requests?run=${encodeURIComponent(run.id)}`}>
      <HugeiconsIcon icon={GitPullRequestIcon} className="size-3.5" aria-hidden />
      {t("viewPullRequest")}{run.pr_number ? ` #${run.pr_number}` : ""}
    </Link>
  </Button>;
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
  events,
}: {
  state: DelegatedWorkState;
  run: AgentRunSummary | null | undefined;
  changedFileCount: number;
  events: Parameters<typeof delegatedWorkDurationMs>[1];
}) {
  const t = useTranslations("Agent");
  const tNativeModels = useTranslations("NativeAgentModels");
  const working = state === "starting" || state === "queued" || state === "running";
  const now = useNow({ updateInterval: working ? 1000 : undefined });
  const phase = events.filter((event) => event.type === "status" && event.payload?.phase).at(-1)?.payload?.phase;
  const startupKey = phase === "native_preparing" ? "preparingEngine" : phase === "native_starting" ? "startingEngine" : null;
  const StateIcon = STATE_ICONS[state];

  return (
    <div className="grid gap-3 text-xs text-muted-foreground">
      <div className="flex items-center justify-between gap-3">
      <span
        className={cn(
          "inline-flex items-center gap-1",
          state === "waiting_input" && "text-amber-700 dark:text-amber-400",
          state === "failed" && "text-destructive",
        )}
        aria-live="polite"
      >
        <AppIcon
          icon={StateIcon}
          className={cn(
            "size-3.5",
            (state === "starting" ||
              state === "queued" ||
              state === "running" ||
              state === "stopping") &&
              "animate-spin",
          )}
          aria-hidden
        />
        {state === "running" && startupKey ? t(startupKey, { agent: agentEngineDisplay(run?.agent_engine).name ?? t("engineLegacyLabel") }) : t(`delegatedWorkState_${state}`)}
      </span>
      {run ? (
        <span className="shrink-0 tabular-nums">
          {elapsedLabel(t, delegatedWorkDurationMs(run, events, now.getTime()))}
        </span>
      ) : null}
      </div>
      <div className="grid gap-2">
        <AgentEngineBadge engine={run?.agent_engine} size={14} />
        {isNativeAgentEngine(run?.agent_engine) ? <NumoModelLine
          model={`${run?.agent_engine === "codex" ? "openai" : "anthropic"}/${run?.model?.split("/").slice(1).join("/") || "default"}`}
          name={!run?.model || run.model.endsWith("/default") ? tNativeModels("automatic") : formatModelName(run.model)}
          label={run?.native_reasoning_effort
            ? tNativeModels(`effort_${run.native_reasoning_effort}` as Parameters<typeof tNativeModels>[0])
            : tNativeModels("automatic")}
        /> : <NumoModelLine
          model={run?.model}
          label={run?.reasoning_level ? t(REASONING_LABEL_KEYS[run.reasoning_level]) : ""}
        />}
      </div>
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
function DelegatedSubagents({ subagents, active, settledAt }: {
  subagents: TurnSubagent[];
  active: boolean;
  settledAt?: string | null;
}) {
  const t = useTranslations("Agent");
  const runningCount = subagents.filter((subagent) => active && !subagent.endedAt).length;
  const now = useNow({ updateInterval: runningCount > 0 ? 1000 : undefined });

  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <p className="flex items-center gap-1.5 font-medium text-muted-foreground">
        {runningCount > 0 ? (
          <Spinner className="size-3" aria-hidden />
        ) : (
          <HugeiconsIcon icon={BotIcon} className="size-3.5 shrink-0" aria-hidden />
        )}
        {runningCount > 0
          ? t("subagentsWorking", { count: runningCount })
          : t("subagentsSession")}
      </p>
      <ul className="mt-1.5 grid gap-1">
        {subagents.map((subagent) => {
          const running = active && !subagent.endedAt;
          const start = msOr(subagent.startedAt, now.getTime());
          const end = running ? now.getTime() : msOr(subagent.endedAt ?? settledAt ?? null, start);

          return (
            <li
              key={subagent.id}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              {running ? (
                <Spinner className="size-3 shrink-0 text-blue-500" aria-hidden />
              ) : (
                <AppIcon icon={CheckIcon} className="size-3.5 shrink-0 text-brand" aria-hidden />
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
  // Optimistic stop (PR 304 reference): the first click folds the whole
  // presentation immediately — state line, live feed, chrono — and only the
  // quiet reconciliation of the run query settles the card into its final
  // state when the worker actually rests.
  const [stopping, setStopping] = useState(false);
  const rawState = delegatedWorkState(call, run);
  const state: DelegatedWorkState =
    stopping && working ? "stopping" : rawState;

  useEffect(() => {
    if (!working) setStopping(false);
  }, [working]);

  const stopWorker = async () => {
    if (!runId) return;
    setStopping(true);
    try {
      await interruptAgentRunApi(runId);
    } catch (error) {
      // The stop did not land (network, run already at rest): hand control
      // back instead of leaving a dead presentation.
      setStopping(false);
      toast.error((error as Error).message);
    }
  };

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
          "flex w-full flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs",
          state === "waiting_input" && "border-amber-500/40",
          state === "failed" && "border-destructive/40",
        )}
        data-delegated-work-id={runId ?? call.id}
      >
        <div className="flex min-w-0 items-start gap-3">
          <p className="min-w-0 flex-1 line-clamp-2 text-sm font-medium leading-5">{title}</p>
          {runId ? <DelegatedWorkStopButton working={working} stopping={stopping} onStop={() => void stopWorker()} /> : null}
        </div>
        <DelegatedWorkMeta state={state} run={run} events={events} changedFileCount={changedFileCount} />
        {subagents.length > 0 ? (
          <DelegatedSubagents subagents={subagents} active={working} settledAt={run?.completed_at ?? run?.updated_at} />
        ) : null}
        {run?.pr_url || run?.branch_name || artifacts.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-t pt-2 text-xs text-muted-foreground">
            {run?.branch_name ? <DelegatedBranchLine branch={run.branch_name} /> : null}
            {artifacts.map((artifact) => {
              if (
                artifact.kind === "pull_request" &&
                artifact.url === run?.pr_url
              ) return null;
              const ArtifactIcon = artifact.kind === "commit"
                ? GitCommitIcon
                : artifact.kind === "pull_request"
                  ? GitPullRequestIcon
                  : PackageIcon;
              const content = (
                <>
                  <AppIcon icon={ArtifactIcon} className="size-3.5 shrink-0" aria-hidden />
                  <span className="max-w-64 truncate font-mono">{artifact.ref}</span>
                  {artifact.url && artifact.kind !== "pull_request" ? <HugeiconsIcon icon={LinkSquare01Icon} className="size-3 shrink-0" aria-hidden /> : null}
                </>
              );
              return artifact.url ? (
                <Link
                  key={`${artifact.kind}:${artifact.ref}:${artifact.url}`}
                  href={artifact.kind === "pull_request" && runId ? `/pull-requests?run=${encodeURIComponent(runId)}` : artifact.url}
                  target={artifact.kind === "pull_request" ? undefined : "_blank"}
                  rel={artifact.kind === "pull_request" ? undefined : "noreferrer"}
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
        {run ? <DelegatedPrButton run={run} /> : null}
        <Button type="button" variant="default" size="sm" className="w-full" disabled={!runId} onClick={() => setDetailsOpen(true)}>
          {t("delegatedWorkView")}
        </Button>
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
              <div className="flex min-w-0 flex-1 items-start gap-2">
                <div className="flex min-w-0 flex-1 flex-col gap-4">
                  <SidePanelTitle className="line-clamp-2 text-sm font-medium leading-5">
                    {title}
                  </SidePanelTitle>
                  <SidePanelDescription asChild>
                    <div><DelegatedWorkMeta
                      state={state}
                      run={run}
                      events={events}
                      changedFileCount={changedFileCount}
                    /></div>
                  </SidePanelDescription>
                </div>
                <DelegatedWorkStopButton
                  working={working}
                  stopping={stopping}
                  onStop={() => void stopWorker()}
                />
              </div>
            </SidePanelHeader>
            {run?.branch_name || run?.pr_url ? <div className="grid gap-3 px-4 pb-3 text-xs text-muted-foreground">
              {run.branch_name ? <DelegatedBranchLine branch={run.branch_name} /> : null}
              <DelegatedPrButton run={run} />
            </div> : null}
            {subagents.length > 0 ? <div className="px-4 pb-3"><DelegatedSubagents subagents={subagents} active={working} settledAt={run?.completed_at ?? run?.updated_at} /></div> : null}
            <SidePanelBody className="flex min-h-0 flex-1 flex-col p-0">
              {/* The feed scrolls itself (`overflow-y-auto`); the muted note
              stays pinned at the bottom of the panel, under the thread. */}
              <AgentEventFeed
                runId={runId}
                engine={run?.agent_engine}
                status={run?.status ?? "queued"}
                prompt={run?.prompt}
                promptMentions={run?.prompt_mentions}
                stopping={stopping}
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
