"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, Spinner, cn } from "mangue-ui";
import { CheckCircle2, ChevronRight, Circle, CircleSlash, ListChecks } from "lucide-react";
import type { PlanStep } from "@/lib/agent-plan";

/**
 * The CHECKLIST of the session, just above the composer.
 *
 * The plan lived in the thread, where the agent had placed it — that is to say
 * at a place that goes back: ten tool-calls later he left the screen, and
 * knowing where the work stands requires scrolling up to find
 * a map that we reread in its entirety. But this is the information we consult the most
 * often, and the only one that sums up the tour at a glance.
 *
 * It therefore takes the place where the thread deposits what must remain before the eyes:
 * against the composition, to its width, to the exact design of the sub-agent bar
 * ([subagent-activity-bar](./subagent-activity-bar.tsx)) and the “files” block
 * changed” — same surface, same chevron, same removal from list. The wire does not
 * than a grammar.
 *
 * Folded, it only says what we were looking for: the CURRENT step, and the count
 * done/total. Unfolded, the entire plan, of the same design as the map it replaces.
 * A single height line as long as you don't open it: the input doesn't go down
 * while we write.
 *
 * The current step carries a SPINNER, not a stationary pellet: this is the brand
 * minddy’s “it’s running” (the sub-agents, the conversations column), and
 * this is the only difference to read between the current step and those which have been
 * checked. A fixed icon was only distinguished by its shape.
 *
 * She only lives during the turn that set her plan (see `livePlan`). No
 * “current agent” border however, unlike the sub-agent map:
 * she poses against the composer, who is ALREADY wearing his during the round
 * ([chat-input](../assistant/chat-input.tsx), `beam={working}`). Two borders
 * stacked two pixels apart do not say “it’s running” twice: they
 * read like a frame. What is happening here is read on the current step spinner
 * and the shimmer of its wording.
 */
export function PlanActivityBar({ steps }: { steps: PlanStep[] }) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  if (steps.length === 0) return null;

  const done = steps.filter((s) => s.status === "completed").length;
  const current = steps.find((s) => s.status === "in_progress");

  return (
    <div className="px-3 pb-2">
      <div className="rounded-xl border border-border bg-card">
        <Collapsible open={open} onOpenChange={setOpen}>
          <div className="flex items-center gap-2 px-3 py-2.5">
            <CollapsibleTrigger className="group flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium text-muted-foreground outline-hidden transition-colors hover:text-foreground">
              <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
              <ListChecks className="size-3.5 shrink-0" />
              {/* The current step rather than the word “Plan”: this is what we
 are looking for. The shimmer only runs as long as she moves forward. */}
              <span className={cn("truncate", current && "text-shimmer")}>
                {current ? current.step : t("plan")}
              </span>
              {/* Pasted to the right and tabular: a counter must not dance
 when the next step changes length. */}
              <span className="ml-auto shrink-0 pl-2 tabular-nums">
                {done}/{steps.length}
              </span>
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent>
            <div className="flex flex-col px-1.5 pb-2">
              {steps.map((s, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-md px-2 py-2 text-left text-xs",
                    s.status === "in_progress" ? "text-foreground" : "text-muted-foreground",
                    s.status === "cancelled" && "line-through",
                  )}
                >
                  {s.status === "completed" ? (
                    <CheckCircle2 className="mt-px size-3.5 shrink-0 text-brand" />
                  ) : s.status === "in_progress" ? (
                    <Spinner className="mt-px size-3.5 shrink-0 text-brand" />
                  ) : s.status === "cancelled" ? (
                    <CircleSlash className="mt-px size-3.5 shrink-0" />
                  ) : (
                    <Circle className="mt-px size-3.5 shrink-0" />
                  )}
                  <span className="min-w-0">{s.step}</span>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
