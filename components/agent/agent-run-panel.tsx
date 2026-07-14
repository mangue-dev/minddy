"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Spinner, toast } from "mangue-ui";
import { Loader2, Square } from "lucide-react";
import {
  useAgentRunEventsQuery,
  issueAgentRunsQueryKey,
} from "@/lib/use-agent-runs";
import {
  isAgentRunActive,
  stopAgentRunApi,
  type AgentRunSummary,
  type AgentRunEvent,
} from "@/lib/agent-api";
import { PrReview } from "./pr-review";

const STATUS_KEY: Record<string, string> = {
  queued: "statusQueued",
  running: "statusRunning",
  needs_input: "statusNeedsInput",
  completed: "statusCompleted",
  failed: "statusFailed",
  canceled: "statusCanceled",
};

function EventLine({ event }: { event: AgentRunEvent }) {
  const p = event.payload ?? {};
  const text = typeof p.text === "string" ? p.text : "";
  const name = typeof p.name === "string" ? p.name : "";
  switch (event.type) {
    case "thinking":
      return <p className="whitespace-pre-wrap text-xs text-muted-foreground">{text}</p>;
    case "tool_call":
      return <p className="font-mono text-xs text-foreground/80">→ {name}</p>;
    case "tool_result":
      return (
        <p className="font-mono text-xs text-muted-foreground">
          {p.success === false ? "✗" : "✓"} {name}
        </p>
      );
    case "commit":
      return <p className="text-xs text-muted-foreground">• commit</p>;
    case "pr_opened":
      return <p className="text-xs text-brand">PR #{String(p.number ?? "")}</p>;
    case "summary":
      return <p className="whitespace-pre-wrap text-sm">{text}</p>;
    case "error":
      return (
        <p className="whitespace-pre-wrap text-xs text-destructive">
          {typeof p.message === "string" ? p.message : text}
        </p>
      );
    default:
      return null;
  }
}

/**
 * Vue live d'un run d'agent (MIN-46) : statut, modèle, coût, flux d'événements
 * (thinking / tool calls / commits), bouton stop tant qu'il est actif, et la
 * review de PR in-app quand un run a ouvert une pull request.
 */
export function AgentRunPanel({ issueId, run }: { issueId: string; run: AgentRunSummary }) {
  const t = useTranslations("Agent");
  const queryClient = useQueryClient();
  const active = isAgentRunActive(run.status);
  const { events } = useAgentRunEventsQuery(run.id, active);
  const [stopping, setStopping] = useState(false);

  const stop = async () => {
    if (stopping) return;
    setStopping(true);
    try {
      await stopAgentRunApi(run.id);
      await queryClient.invalidateQueries({ queryKey: issueAgentRunsQueryKey(issueId) });
      toast.success(t("stoppedToast"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStopping(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {active && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <span className="text-xs font-medium">{t(STATUS_KEY[run.status] ?? "statusQueued")}</span>
          {run.model ? (
            <span className="truncate text-xs text-muted-foreground">· {run.model}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <span className="tabular-nums text-xs text-muted-foreground">
            ${run.cost_usd.toFixed(4)}
          </span>
          {active ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void stop()}
              disabled={stopping}
            >
              {stopping ? <Spinner /> : <Square className="size-3.5" />}
              {t("stop")}
            </Button>
          ) : null}
        </div>
      </div>

      {events.length > 0 ? (
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto border-t border-border pt-2">
          {events.map((e) => (
            <EventLine key={e.id} event={e} />
          ))}
        </div>
      ) : null}

      {run.status === "failed" && run.error_message ? (
        <p className="text-xs text-destructive">{run.error_message}</p>
      ) : null}

      {run.pr_number != null ? <PrReview runId={run.id} /> : null}
    </div>
  );
}
