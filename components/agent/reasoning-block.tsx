"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { Brain } from "lucide-react";
import { Markdown } from "@/components/markdown";

/**
 * The model REFLECTS (MIN-122). Compact line modeled on `ToolCallRow`
 * (components/assistant/tool-call-display.tsx): same size, same density —
 * a work step among others, not a message.
 *
 * What we DON’T do: stream the reasoning. It was formerly written in
 * directly in the thread, which drowned the real unfolding under pages of monologue.
 * During reflection, there is only one wording that breathes and a counter of
 * seconds right; the trace arrives with the end of round event and
 * unfolds on demand.
 *
 * The counter does NOT have its own clock (neither `setInterval`, nor the `useNow` of
 * `WorkAccordion`): `durationMs` is measured server-side and re-broadcast ~4 times
 * per second during reflection — the component just has to display it. A clock
 * local would cause the counter to diverge from the duration actually persisted, and
 * would continue to run on a round that has already ended.
 */
export function ReasoningBlock({
  /** Reflection IN PROGRESS: wording that breathes, counter that runs. */
  active,
  /** Milliseconds of reflection: measured on the server side, or the last direct received. */
  durationMs,
  /** Trace persisted, unfoldable once the round is over. Empty = nothing to unfold. */
  text,
}: {
  active: boolean;
  durationMs: number;
  text?: string;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const seconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(seconds / 60);
  const counter =
    minutes > 0
      ? t("reasoningForMinutes", { minutes, seconds: seconds % 60 })
      : t("reasoningForSeconds", { seconds });

  const trace = (text ?? "").trim();
  const expandable = !active && trace.length > 0;

  const row = (
    <div className="flex items-center gap-2 py-0.5 text-xs text-muted-foreground">
      <Brain className="size-3 shrink-0" />
      <span className={cn("flex-1 truncate text-left", active && "text-shimmer")}>
        {t("reasoning")}
      </span>
      {/* Counter to the RIGHT of the line — tabular, so it doesn't dance in
          changeant de chiffre. */}
      <span className="shrink-0 tabular-nums">{counter}</span>
    </div>
  );

  if (!expandable) return row;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="w-full outline-hidden transition-colors hover:text-foreground">
        {row}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* The trace is MARKDOWN, like the report of a sub-agent: a model
 which reasons writes titles, lists and paths in `code`.
 Rendered in plain text, we read "**Step 1**" and "---" at
 on the screen. */}
        <div className="ml-5 py-1 text-muted-foreground">
          <Markdown className="text-xs">{trace}</Markdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
