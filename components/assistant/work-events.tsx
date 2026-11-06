"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, BrainIcon } from "@hugeicons/core-free-icons";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { groupWorkEvents, workEventsRevealKey, type WorkEvent } from "@/lib/work-event-groups";
import { AppIcon } from "@/components/icon";
import {
  summarizeToolCalls,
  TOOL_ICON_CLASS,
  TOOL_LINE_CLASS,
  toolCallIcon,
  toolCallLabel,
  type ToolCallItem,
} from "@/components/assistant/tool-call-display";
import { GroupedActionsProvider } from "./grouped-actions-context";

function ActionGroup({
  group,
  children,
}: {
  group: ReturnType<typeof groupWorkEvents<ReactNode>>[number];
  children: ReactNode;
}) {
  const t = useTranslations("ToolCall");
  const revealKey = workEventsRevealKey(group.events);
  const toolCalls = group.events.flatMap((event) => event.toolCalls ?? []);
  const runningTool = [...toolCalls]
    .reverse()
    .find((call) => call.status === "running");
  // A thinking event IS an action while it runs: it takes the group heading,
  // shimmering, exactly like a running tool call would. Once it ends, it
  // leaves: the summary counts only what the tools did.
  const active = Boolean(runningTool) || group.active;
  const label = runningTool
    ? toolCallLabel(runningTool as ToolCallItem, t)
    : group.active
      ? t("thinking")
      : toolCalls.length > 0
        ? summarizeToolCalls(toolCalls as ToolCallItem[], t)
        : t("toolCallSummary", { count: group.count });
  const headingIcon = runningTool
    ? toolCallIcon(runningTool.name)
    : group.active
      ? BrainIcon
      : toolCallIcon(toolCalls.at(-1)?.name ?? "");
  // The step stays folded on its one line, live or done (MIN-918): the label
  // already names the running action, and the detail is one click away. Only
  // a newly received credential opens it, while the user may close an
  // already acknowledged one.
  const [open, setOpen] = useState(Boolean(revealKey));
  useEffect(() => {
    if (revealKey) setOpen(true);
  }, [revealKey]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          TOOL_LINE_CLASS,
          "group w-fit max-w-full text-left text-muted-foreground outline-hidden transition-colors hover:text-foreground",
        )}
      >
        <AppIcon icon={headingIcon} className={TOOL_ICON_CLASS} />
        <span className={cn("min-w-0 truncate", active && "text-shimmer")}>
          {label}
        </span>
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <GroupedActionsProvider value={true}>
          <div className="ml-6 flex flex-col gap-1 pt-1">{children}</div>
        </GroupedActionsProvider>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Action groups live inside the turn accordion, separated only by narration.
 *  A single action stays a plain line, thinking included: the reasoning row
 *  shimmers and counts by itself, so a step around it would only add a fold. */
export function WorkEvents({ events }: { events: WorkEvent<ReactNode>[] }) {
  return groupWorkEvents(events).map((group) => {
    const content = group.events.map((event) => (
      <Fragment key={event.key}>{event.content}</Fragment>
    ));
    return group.count > 1 ? (
      <ActionGroup key={group.key} group={group}>{content}</ActionGroup>
    ) : (
      <Fragment key={group.key}>{content}</Fragment>
    );
  });
}
