"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Spinner, cn, toast } from "mangue-ui";
import {
  AlertTriangle,
  Ban,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  FilePen,
  FileSearch,
  FolderTree,
  GitCommit,
  GitPullRequest,
  HelpCircle,
  Loader2,
  Search,
  Square,
  Terminal,
  X,
  type LucideIcon,
} from "lucide-react";
import { Markdown } from "@/components/markdown";
import {
  useAgentRunEventsQuery,
  issueAgentRunsQueryKey,
} from "@/lib/use-agent-runs";
import {
  isAgentRunActive,
  stopAgentRunApi,
  type AgentRunSummary,
  type AgentRunEvent,
  type AgentRunStatus,
} from "@/lib/agent-api";
import { PrReview } from "./pr-review";

const STATUS_META: Record<
  AgentRunStatus,
  { key: string; cls: string; icon: LucideIcon; spin?: boolean }
> = {
  queued: { key: "statusQueued", cls: "border-brand/20 bg-brand/10 text-brand", icon: Loader2, spin: true },
  running: { key: "statusRunning", cls: "border-brand/20 bg-brand/10 text-brand", icon: Loader2, spin: true },
  needs_input: {
    key: "statusNeedsInput",
    cls: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
    icon: HelpCircle,
  },
  completed: {
    key: "statusCompleted",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    icon: CheckCircle2,
  },
  failed: { key: "statusFailed", cls: "border-destructive/30 bg-destructive/10 text-destructive", icon: AlertTriangle },
  canceled: { key: "statusCanceled", cls: "border-border bg-muted text-muted-foreground", icon: Ban },
};

const TOOL_META: Record<
  string,
  { icon: LucideIcon; verbKey: string; targetKey: "path" | "pattern" | "command" | null }
> = {
  read_file: { icon: FileSearch, verbKey: "toolRead", targetKey: "path" },
  list_dir: { icon: FolderTree, verbKey: "toolList", targetKey: "path" },
  grep: { icon: Search, verbKey: "toolSearch", targetKey: "pattern" },
  write_file: { icon: FilePen, verbKey: "toolEdit", targetKey: "path" },
  run_command: { icon: Terminal, verbKey: "toolRun", targetKey: "command" },
};

/** Cible d'un tool (path/pattern/command). Fallback sur l'ancien format (args en JSON). */
function resolveTarget(name: string, p: Record<string, unknown>): string {
  const key = TOOL_META[name]?.targetKey;
  if (!key) return "";
  const direct = p[key];
  if (typeof direct === "string" && direct) return direct;
  if (typeof p.args === "string") {
    try {
      const o = JSON.parse(p.args) as Record<string, unknown>;
      if (typeof o[key] === "string") return o[key] as string;
    } catch {
      // ignore
    }
  }
  return "";
}

function EventItem({
  event,
  resultById,
}: {
  event: AgentRunEvent;
  resultById: Map<string, { success: boolean }>;
}) {
  const t = useTranslations("Agent");
  const p = event.payload ?? {};

  switch (event.type) {
    case "thinking": {
      const text = typeof p.text === "string" ? p.text : "";
      if (!text.trim()) return null;
      return <Markdown className="text-xs text-muted-foreground">{text}</Markdown>;
    }
    case "tool_call": {
      const name = String(p.name ?? "");
      const id = String(p.id ?? "");
      const m = TOOL_META[name];
      const Icon = m?.icon ?? Bot;
      const res = resultById.get(id);
      const running = !res;
      const error = !!res && !res.success;
      const target = resolveTarget(name, p);
      const mark = running ? (
        <Loader2 className="size-3 shrink-0 animate-spin opacity-70" />
      ) : error ? (
        <X className="size-3 shrink-0" />
      ) : (
        <Check className="size-3 shrink-0 opacity-50" />
      );

      // run_command : on affiche la VRAIE commande, pas juste le libellé.
      if (name === "run_command") {
        return (
          <div className={cn("flex items-center gap-2 text-xs", error ? "text-destructive" : "text-muted-foreground")}>
            <Terminal className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/80" title={target}>
              $ {target}
            </span>
            {mark}
          </div>
        );
      }

      return (
        <div className={cn("flex items-center gap-2 text-xs", error ? "text-destructive" : "text-muted-foreground")}>
          <Icon className="size-3.5 shrink-0" />
          <span className="shrink-0">{m ? t(m.verbKey) : name}</span>
          {target ? (
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/70" title={target}>
              {target}
            </span>
          ) : (
            <span className="flex-1" />
          )}
          {mark}
        </div>
      );
    }
    case "commit":
      return (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitCommit className="size-3.5 shrink-0" />
          {t("commitLabel")}
        </div>
      );
    case "pr_opened":
      return (
        <div className="flex items-center gap-2 text-xs text-brand">
          <GitPullRequest className="size-3.5 shrink-0" />
          PR #{String(p.number ?? "")}
        </div>
      );
    case "summary": {
      const text = typeof p.text === "string" ? p.text : "";
      if (!text.trim()) return null;
      return (
        <div className="rounded-lg border border-border bg-muted/40 p-2.5">
          <Markdown className="text-xs">{text}</Markdown>
        </div>
      );
    }
    case "error": {
      const msg =
        typeof p.message === "string" ? p.message : typeof p.text === "string" ? p.text : "";
      if (!msg.trim()) return null;
      return (
        <div className="flex items-start gap-2 text-xs text-destructive">
          <AlertTriangle className="size-3.5 shrink-0" />
          <span className="whitespace-pre-wrap">{msg}</span>
        </div>
      );
    }
    default:
      // status, tool_result → n'apparaissent pas comme lignes (pilotent l'en-tête / fusionnés)
      return null;
  }
}

/**
 * Vue live d'un run d'agent (MIN-46), inspirée de l'interface d'activité de
 * génération d'AutoKap : en-tête statut + modèle + coût, flux d'événements
 * (thinking en markdown, tool calls fusionnés avec icône/label, commits, PR),
 * auto-scroll, bouton stop, et review de PR quand un run en a ouvert une.
 */
export function AgentRunPanel({ issueId, run }: { issueId: string; run: AgentRunSummary }) {
  const t = useTranslations("Agent");
  const queryClient = useQueryClient();
  const active = isAgentRunActive(run.status);
  const { events } = useAgentRunEventsQuery(run.id, active);
  const [stopping, setStopping] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (active && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events.length, active]);

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

  // Fusionne tool_result dans tool_call par id (statut running/ok/erreur).
  const resultById = new Map<string, { success: boolean }>();
  for (const e of events) {
    if (e.type === "tool_result") {
      const id = String(e.payload?.id ?? "");
      if (id) resultById.set(id, { success: e.payload?.success !== false });
    }
  }

  const meta = STATUS_META[run.status] ?? STATUS_META.queued;
  const StatusIcon = meta.icon;
  const modelShort = run.model ? run.model.split("/").pop() : null;

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
              meta.cls,
            )}
          >
            <StatusIcon className={cn("size-3.5", meta.spin && "animate-spin")} />
            {t(meta.key)}
          </span>
          {modelShort ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Cpu className="size-3" />
              {modelShort}
            </span>
          ) : null}
        </div>
        {active ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => void stop()} disabled={stopping}>
            {stopping ? <Spinner /> : <Square className="size-3.5" />}
            {t("stop")}
          </Button>
        ) : null}
      </div>

      {events.length > 0 ? (
        <div
          ref={feedRef}
          className="flex max-h-72 flex-col gap-2.5 overflow-y-auto overscroll-contain border-t border-border pt-3"
        >
          {events.map((e) => (
            <EventItem key={e.id} event={e} resultById={resultById} />
          ))}
          {active ? (
            <div className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
              <Bot className="size-4 shrink-0 animate-pulse" />
              <span>{t("working")}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {run.status === "failed" && run.error_message ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          {run.error_message}
        </div>
      ) : null}

      {run.pr_number != null ? <PrReview runId={run.id} /> : null}
    </div>
  );
}
