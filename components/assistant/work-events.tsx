"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger, cn } from "mangue-ui";
import { groupWorkEvents, workEventsRevealKey, type WorkEvent } from "@/lib/work-event-groups";
import {
  summarizeToolCalls,
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
  const [open, setOpen] = useState(Boolean(revealKey));
  const toolCalls = group.events.flatMap((event) => event.toolCalls ?? []);
  const runningTool = [...toolCalls]
    .reverse()
    .find((call) => call.status === "running");
  // A reasoning event can accompany tool calls in one continuous burst. Its
  // activity must not replace the real action in the group heading.
  const active = toolCalls.length > 0 ? Boolean(runningTool) : group.active;
  const label = runningTool
    ? toolCallLabel(runningTool as ToolCallItem, t)
    : toolCalls.length > 0
      ? summarizeToolCalls(toolCalls as ToolCallItem[], t)
      : t("toolCallSummary", { count: group.count });
  useEffect(() => {
    // Results can arrive after a group mounts. Reopen for each new credential,
    // while allowing the user to close an already acknowledged callout.
    if (revealKey) setOpen(true);
  }, [revealKey]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="group flex w-full items-center gap-2 py-0.5 text-left text-xs text-muted-foreground hover:text-foreground">
        <ChevronRight className="size-3 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className={cn(active && "text-shimmer")}>
          {label}
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <GroupedActionsProvider value={true}>
          <div className="ml-5 flex flex-col gap-3 pt-2">{children}</div>
        </GroupedActionsProvider>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Action groups live inside the turn accordion, separated only by narration. */
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
