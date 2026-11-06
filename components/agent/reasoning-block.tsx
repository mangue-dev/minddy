"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, BrainIcon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { TOOL_ICON_CLASS, TOOL_LINE_CLASS } from "@/components/assistant/tool-call-display";

/**
 * The model REFLECTS (MIN-122). One line in the style of `ToolCallRow`
 * (components/assistant/tool-call-display.tsx): body size, greyed — a work
 * step among others, not a message.
 *
 * The line says how long the model thought (“Thought for 6 seconds”) and
 * stays FOLDED by default, live or not (MIN-918): the reader opens the trace
 * when they want it, and it then reads at the size of the answer. While the
 * reflection runs, the label shimmers and its counter climbs.
 *
 * The counter does NOT have its own clock (neither `setInterval`, nor the `useNow` of
 * `WorkAccordion`): `durationMs` is measured server-side and re-broadcast ~4 times
 * per second during reflection — the component just has to display it. A local
 * clock would make the counter diverge from the duration actually persisted, and
 * would keep running on a turn that has already ended.
 */
export function ReasoningBlock({
  /** Reflection IN PROGRESS: wording that breathes, counter that runs. */
  active,
  /** Milliseconds of reflection: measured on the server side, or the last direct received. */
  durationMs,
  /** Trace so far (live) or persisted. Empty = nothing to unfold. */
  text,
}: {
  active: boolean;
  durationMs: number;
  text?: string;
}) {
  const t = useTranslations("Agent");
  const [open, setOpen] = useState(false);

  const total = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  const label = active
    ? minutes > 0
      ? t("thinkingForMinutes", { minutes, seconds })
      : t("thinkingForSeconds", { seconds })
    : minutes > 0
      ? t("thoughtForMinutes", { minutes, seconds })
      : t("thoughtForSeconds", { seconds });

  const trace = (text ?? "").trim();
  const content = (
    <>
      <HugeiconsIcon icon={BrainIcon} className={TOOL_ICON_CLASS} />
      {/* Tabular digits, so the live counter does not dance. */}
      <span className={cn("min-w-0 truncate tabular-nums", active && "text-shimmer")}>
        {label}
      </span>
    </>
  );

  if (!trace) {
    return <div className={cn(TOOL_LINE_CLASS, "text-muted-foreground")}>{content}</div>;
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          TOOL_LINE_CLASS,
          "group w-fit max-w-full text-left text-muted-foreground outline-hidden transition-colors hover:text-foreground",
        )}
      >
        {content}
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* The trace is MARKDOWN: a reasoning model writes headings, lists
            and paths in `code`. Plain text would show "**Step 1**" and "---". */}
        <div className="ml-6 py-1 text-muted-foreground">
          <Markdown className="content-selectable text-sm leading-relaxed">{trace}</Markdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
