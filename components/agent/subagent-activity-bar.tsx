"use client";

import { useState } from "react";
import { useNow, useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Spinner, cn } from "mangue-ui";
import { Bot, CheckCircle2, ChevronRight } from "lucide-react";
import { AgentBeam } from "@/components/agent-beam";
import type { TurnSubagent } from "@/lib/agent-subagents";

/** A girl's chrono, in the shape of those of the thread (`SubagentBlock`). */
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

/** Parsed instant, or `fallback` if the ISO is unreadable (never NaN in calculation). */
function msOr(iso: string | null, fallback: number): number {
  if (!iso) return fallback;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? fallback : ms;
}

/**
 * What the SUBAGENTS of the current round do, just above the dial
 * (MIN-112).
 *
 * While a daughter works, the parent waits for her: he no longer emits anything, the thread
 * freezes, and the current round may remain silent for several minutes. All this
 * who says the session is alive - the girl's folded line and her timer -
 * is then somewhere higher up in a thread that we ended up taking our eyes off of.
 * We wonder if it's still running.
 *
 * This card is the answer, and it is where we look when we ask ourselves
 * question: against the composition, its width, the exact design of the “files” block
 * changed” ([changed-files-block](./changed-files-block.tsx)) — same surface, same
 * breathing, same chevron, same withdrawal from the list. One more card is not one
 * one more drawing: it's the same, and the thread only has one grammar.
 *
 * Folded, it only says what we were looking for — HOW many girls work
 * again, SINCE when. Unfolded, the whole tour: each girl, her type, and her
 * DURATION — which runs for those at work and freezes for those who have returned.
 * These keep their line, marked with a ✓: delegate three explorations and
 * seeing only one gives the impression that the other two have been lost.
 *
 * Duration rather than number of steps: a girl can read a large file or
 * think for a minute without asking anything, and a frozen step counter looks like
 * a dead agent — this is already the arbitration of `SubagentBlock`.
 */
export function SubagentActivityBar({ subagents }: { subagents: TurnSubagent[] }) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);
  const now = useNow({ updateInterval: 1000 });

  const running = subagents.filter((s) => !s.endedAt);
  // Nothing more at work: the parent has taken control again, the thread tells the story again.
  if (running.length === 0) return null;

  // Card time is for the oldest girl STILL working:
  // She’s the one who says how long the trick has been waiting.
  const oldestStart = Math.min(...running.map((s) => msOr(s.startedAt, now.getTime())));

  return (
    <div className="px-3 pb-2">
      {/* The “agent in progress” border (MIN-46), the same as on other surfaces where
 something is rotating — the card of a ticket, dial it during a
 response. Always On: This card ONLY exists as long as a girl
 is working. Its radius is that of the card (`rounded-xl`), otherwise it
 would run on angles which are not its own. */}
      <AgentBeam active className="rounded-xl">
        <div className="rounded-xl border border-border bg-card">
          <Collapsible open={open} onOpenChange={setOpen}>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
                <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
                <Bot className="size-3.5 shrink-0" />
                <span className="truncate text-shimmer">
                  {t("subagentsWorking", { count: running.length })}
                </span>
                {/* Pasted on the right and tabular: it is a counter which changes every
 second, he must neither dance nor move when a girl from
 plus extends the wording. */}
                <span className="ml-auto shrink-0 pl-2 tabular-nums">
                  {durationLabel(t, now.getTime() - oldestStart)}
                </span>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent>
              {/* Same list removal as the “changed files” block: the lines
 keep their own margin and do not come up against the edge
 of the card. */}
              <div className="flex flex-col px-1.5 pb-2">
                {subagents.map((s) => {
                  const done = !!s.endedAt;
                  const start = msOr(s.startedAt, now.getTime());
                  // Frozen at its end moment, or alive - the same mechanics
                  // as the lap time (`WorkAccordion`).
                  const end = done ? msOr(s.endedAt, start) : now.getTime();
                  return (
                    <div
                      key={s.id}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs text-muted-foreground"
                    >
                      {/* A working girl wears a SPINNER — the brand
 minddy's “it turns” (the conversations column,
 the header of a folded project). An immobile mark can only be distinguished from ✓ by its shape, while the difference to read is there: one is still moving. */}
                      {done ? (
                        <CheckCircle2 className="size-3.5 shrink-0 text-brand" />
                      ) : (
                        <Spinner className="size-3.5 shrink-0 text-brand" />
                      )}
                      <span className="truncate">
                        {t(
                          s.mode === "implement"
                            ? "subagentImplementName"
                            : "subagentExploreName",
                        )}
                      </span>
                      {/* The duration of a girl's return is a MEASURE, not a
 counter: she will no longer move, and this is what we remember
 from her passage. The fat guy takes her out of the clock next door, which
 is still running. */}
                      <span
                        className={cn("ml-auto shrink-0 tabular-nums", done && "font-semibold")}
                      >
                        {durationLabel(t, end - start)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </AgentBeam>
    </div>
  );
}
