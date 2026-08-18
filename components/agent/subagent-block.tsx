"use client";

import { useState } from "react";
import { useNow, useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { Bot } from "lucide-react";
import { Markdown } from "@/components/markdown";
import type { MessageKey } from "@/lib/i18n-keys";

/**
 * A sub-agent, folded (MIN-112). Compact line with a template of `ReasoningBlock` and
 * of `ToolCallRow`: a step in the tour, not a message.
 *
 * Why fold rather than render the girl's events in the flow: a
 * sub-agent produces as many events as an entire turn (reflections, tool-calls,
 * results). Letting them pass would mix two sessions into a single row of
 * reading, and the turn which delegated would become the most illegible of the
 * conversation — the exact opposite of what delegation brings.
 *
 * What the line says, and why it doesn't say more: the user wants to know
 * WHAT type of agent is running and IF IT is still running. Nor its technical identifier
 * (`sub-1` does not teach it anything — it remains in the unfolded report, where it is used to
 * bring the line closer to the mentions made of it by the parent agent), nor its task (it
 * is already on the `spawn_agent` line just above).
 *
 * On the right, only one value at a time, like `ReasoningBlock`:
 * - DURING work, a ticking clock — it’s the signal of life. The account
 * of steps, it can remain frozen for several tens of seconds while the
 * girl is thinking or reading a large file, and a frozen counter looks like a
 *    agent mort.
 * - ONCE FINISHED, the number of steps: duration no longer teaches anything, effort does.
 */
export function SubagentBlock({
  mode,
  /**
   * Tool-calls from the girl — the only signal of progress that the thread sees, and
   * what the wording calls “steps”. Not to be confused with the `rounds` that
   * `agent_status` / `list_agents` report to the parent: these come from the
   * daughter loop and are smaller (a round can carry several tool-calls).
   * Two measures, two words — never the same number presented twice.
   */
  steps,
  subagentId,
  report,
  error,
  delivered,
  partial,
  /** `created_at` of the girl's FIRST event: the start of her timer. */
  startedAt,
  /** `created_at` de l'event qui l'a close, ou null tant qu'elle tourne. */
  endedAt,
}: {
  mode: "explore" | "implement" | null;
  steps: number;
  subagentId: string;
  report: string;
  error: string;
  delivered: boolean;
  partial: boolean;
  startedAt: string;
  endedAt: string | null;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const trace = (report || error).trim();
  // “Interrupted” does not read in the girl's events (a suspended loop
  // does not issue a summary or error): it is the PARENT who announces it, by delivering a
  // report marked partial. Without this signal, a cut girl would remain “launched”
  // forever in a reread thread.
  const state = error
    ? "Failed"
    : report
      ? "Done"
      : delivered
        ? partial
          ? "Cut"
          : "Done"
        : "Running";
  const running = state === "Running";
  // `mode` can only be null on an event prior to marking (none in base) —
  // we then fall back on the exploration formulation, the least engaging.
  const family = mode === "implement" ? "Implement" : "Explore";

  // Key assembled at runtime: explicitly cast to `MessageKey<"Agent">`
  // (lib/i18n-keys.ts convention) — this is the precise point where the compiler
  // stop checking, and the eight combinations do indeed exist in both catalogs.
  const label = t(`subagent${family}${state}` as MessageKey<"Agent">);

  // Live chrono while it's running, frozen afterwards - same mechanics as
  // `WorkAccordion` (`useNow`), not the `ReasoningBlock` approach: this one
  // is based on a MEASURED duration on the server side and rebroadcast, but a girl does not emit
  // no such beat. Here the local clock is the only way to show
  // that it is alive, and it stops on a real moment (`endedAt`).
  const now = useNow({ updateInterval: running ? 1000 : undefined });
  const startMs = Date.parse(startedAt);
  const safeStart = Number.isNaN(startMs) ? now.getTime() : startMs;
  const elapsedMs = running
    ? Math.max(0, now.getTime() - safeStart)
    : Math.max(0, Date.parse(endedAt ?? startedAt) - safeStart);
  const totalSec = Math.max(1, Math.round(elapsedMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const counter = running
    ? minutes > 0
      ? t("subagentForMinutes", { minutes, seconds: totalSec % 60 })
      : t("subagentForSeconds", { seconds: totalSec })
    : t("subagentSteps", { count: steps });

  const row = (
    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
      <Bot className={cn("size-3 shrink-0", state === "Failed" && "text-destructive")} />
      <span className={cn("flex-1 truncate text-left", running && "text-shimmer")}>{label}</span>
      {/* Tabular: the counter must not dance while changing digits. */}
      <span className="shrink-0 tabular-nums">{counter}</span>
    </div>
  );

  // Nothing to unfold as long as she works: her report does not yet exist, and her
  // text is not streamed (see the runner — a child streaming would overwrite the
  // bubble being written by the parent, they share the topic of the run).
  if (running) return row;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full outline-hidden transition-colors hover:text-foreground">
        {row}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="ml-5 py-1 text-xs text-muted-foreground">
          <p className="mb-1 flex items-center gap-1.5 font-medium">
            {t("subagentReportLabel")}
            {/* The identifier lives HERE: the parent agent refers to it in its
 answer ("the sub-1 report"), and this is the only place where it
 helps bridge the two. */}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{subagentId}</code>
          </p>
          {/* The report is MARKDOWN: a girl writes titles, lists and
 paths in `code`. Rendered in plain text, it read “## Files at the
 root” and “---” on the screen. */}
          {trace ? (
            <Markdown className="text-xs">{trace}</Markdown>
          ) : (
            <p>{t("subagentNoReport")}</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
